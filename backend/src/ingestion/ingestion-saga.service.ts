import { Injectable, Logger } from '@nestjs/common';
import { DocumentStatus, DocumentType } from '../common/enums/document-status.enum';
import { maskPii } from '../common/security/pii-masker.util';
import { ChunkEntity, DocumentEntity } from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { EmbeddingsService } from '../infra/embeddings/embeddings.module';
import { RabbitMqService } from '../infra/rabbitmq/rabbitmq.module';
import { DocumentParserFactory } from './parsers/document-parser.factory';
import { ChunkingStrategyResolver } from './strategies/chunking.strategy';

export interface ExecuteIngestionJobInput {
  tenantId: string;
  documentId: string;
  type: DocumentType;
  buffer?: Buffer;
  rawText?: string;
  sourceUrl?: string;
  attempt?: number;
}

export interface ExecuteIngestionJobResult {
  status: DocumentStatus;
  chunkCount: number;
  attempt: number;
  routedToDlq: boolean;
}

/**
 * Saga Pattern (Tech Decisions Section 3 & PRD FR-3):
 * Orchestrates multi-step document ingestion:
 *   1. Transition document status -> `Processing`
 *   2. Parse raw file/URL via `DocumentParserFactory`
 *   3. Split text into chunks via `ChunkingStrategyResolver`
 *   4. Generate embeddings via `EmbeddingsService` and write to `pgvector` (`chunks` table)
 *   5. Transition document status -> `Ready`
 *
 * Compensating Rollback & Retry/DLQ:
 *   - If any step fails, deletes any partially written `chunks` for `documentId`.
 *   - Retries up to 3 times (`attempt` 1..3) via RabbitMQ.
 *   - On the 3rd failure, routes the job to `document.ingestion.dlq` and marks the document `Failed`.
 */
@Injectable()
export class IngestionSagaService {
  private readonly logger = new Logger(IngestionSagaService.name);
  readonly maxRetries = 3;

  constructor(
    private readonly rlsTransaction: RlsTransactionService,
    private readonly parserFactory: DocumentParserFactory,
    private readonly chunkingResolver: ChunkingStrategyResolver,
    private readonly embeddingsService: EmbeddingsService,
    private readonly rabbitMqService: RabbitMqService,
  ) {}

  async execute(
    input: ExecuteIngestionJobInput,
  ): Promise<ExecuteIngestionJobResult> {
    const attempt = input.attempt ?? 1;

    try {
      // Step 1: Mark status = Processing inside tenant RLS context
      await this.rlsTransaction.runWithTenant(
        input.tenantId,
        async (manager) => {
          await manager
            .getRepository(DocumentEntity)
            .update(
              { id: input.documentId },
              { status: DocumentStatus.PROCESSING, errorMessage: null },
            );
        },
      );

      // Step 2: Parse document via Factory Pattern
      const parser = this.parserFactory.getParser(input.type);
      const parsed = await parser.parse({
        type: input.type,
        buffer: input.buffer,
        rawText: input.rawText,
        sourceUrl: input.sourceUrl,
      });

      // Step 3: Split into chunks via Strategy Pattern
      const chunkingStrategy = this.chunkingResolver.resolve(input.type);
      const chunks = chunkingStrategy.split(parsed.text, parsed.metadata);
      if (chunks.length === 0) {
        throw new Error('Document produced zero text chunks after parsing');
      }

      // Step 4: Generate 1536-dim embeddings
      const embeddings = await this.embeddingsService.embedBatch(
        chunks.map((c) => c.content),
      );

      // Step 5: Persist chunks in pgvector and mark document Ready inside RLS transaction
      await this.rlsTransaction.runWithTenant(
        input.tenantId,
        async (manager) => {
          const chunkRepo = manager.getRepository(ChunkEntity);
          const docRepo = manager.getRepository(DocumentEntity);

          await chunkRepo.delete({ documentId: input.documentId });

          for (let i = 0; i < chunks.length; i++) {
            const vectorLiteral = this.embeddingsService.toPgVectorLiteral(
              embeddings[i],
            );
            await manager.query(
              `INSERT INTO "chunks" ("tenant_id", "document_id", "chunk_index", "content", "metadata", "embedding")
               VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector)`,
              [
                input.tenantId,
                input.documentId,
                chunks[i].chunkIndex,
                chunks[i].content,
                JSON.stringify(chunks[i].metadata),
                vectorLiteral,
              ],
            );
          }

          await docRepo.update(
            { id: input.documentId },
            { status: DocumentStatus.READY, errorMessage: null },
          );
        },
      );

      return {
        status: DocumentStatus.READY,
        chunkCount: chunks.length,
        attempt,
        routedToDlq: false,
      };
    } catch (err) {
      const safeErrorMsg = maskPii((err as Error).message || 'Ingestion error');
      this.logger.warn(
        `Ingestion Saga failed for document ${input.documentId} (attempt ${attempt}/${this.maxRetries}): ${safeErrorMsg}`,
      );

      // Compensating Rollback: remove any partial chunks and update status
      const isFinalFailure = attempt >= this.maxRetries;
      await this.compensateFailure(
        input.tenantId,
        input.documentId,
        safeErrorMsg,
        isFinalFailure,
      );

      if (!isFinalFailure) {
        // Queue next retry attempt (1 -> 2 -> 3)
        await this.rabbitMqService.publishIngestionJob({
          tenantId: input.tenantId,
          documentId: input.documentId,
          attempt: attempt + 1,
        });
        return {
          status: DocumentStatus.PROCESSING,
          chunkCount: 0,
          attempt,
          routedToDlq: false,
        };
      }

      // Exceeded 3 retries: route to Dead-Letter Queue (FR-3)
      await this.rabbitMqService.publishIngestionJob({
        tenantId: input.tenantId,
        documentId: input.documentId,
        attempt: attempt + 1,
      });

      return {
        status: DocumentStatus.FAILED,
        chunkCount: 0,
        attempt,
        routedToDlq: true,
      };
    }
  }

  private async compensateFailure(
    tenantId: string,
    documentId: string,
    errorMessage: string,
    markFailed: boolean,
  ): Promise<void> {
    await this.rlsTransaction.runWithTenant(tenantId, async (manager) => {
      await manager.getRepository(ChunkEntity).delete({ documentId });
      await manager.getRepository(DocumentEntity).update(
        { id: documentId },
        {
          status: markFailed
            ? DocumentStatus.FAILED
            : DocumentStatus.UPLOADED,
          errorMessage,
        },
      );
    });
  }
}
