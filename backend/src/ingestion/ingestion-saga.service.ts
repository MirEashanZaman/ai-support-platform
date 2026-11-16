import { Injectable, Logger } from '@nestjs/common';
import {
  DocumentStatus,
  DocumentType,
} from '../common/enums/document-status.enum';
import {
  SagaOrchestrator,
  SagaStep,
} from '../common/saga/saga-orchestrator';
import { maskPii } from '../common/security/pii-masker.util';
import { ChunkEntity, DocumentEntity } from '../database/entities';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { EmbeddingsService } from '../infra/embeddings/embeddings.module';
import { RabbitMqService } from '../infra/rabbitmq/rabbitmq.module';
import {
  DocumentParserFactory,
  ParsedDocumentOutput,
} from './parsers/document-parser.factory';
import {
  ChunkingStrategyResolver,
  TextChunkResult,
} from './strategies/chunking.strategy';

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
  rolledBack?: boolean;
  completedSteps?: string[];
  compensatedSteps?: string[];
}

interface IngestionSagaContext {
  input: ExecuteIngestionJobInput;
  attempt: number;
  isFinalAttempt: boolean;
  parsed?: ParsedDocumentOutput;
  chunks: TextChunkResult[];
  embeddings: number[][];
}

/**
 * Saga Pattern with LIFO Compensating Rollback (Tech Decisions Section 3 & PRD FR-3):
 * Uses `SagaOrchestrator` across 4 transactional stages:
 *   1. `MarkDocumentProcessing` (Compensate: revert status to `Uploaded` or `Failed` with error)
 *   2. `ParseDocumentContent` (Compensate: clear parsed buffer/text state)
 *   3. `ChunkAndEmbedVectors` (Compensate: release generated chunks & vectors)
 *   4. `PersistPgVectorChunksAndMarkReady` (Compensate: delete partial chunks in pgvector)
 *
 * Failed jobs retry up to 3 times via RabbitMQ before routing to the Dead-Letter Queue (`document.ingestion.dlq`).
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
    const isFinalAttempt = attempt >= this.maxRetries;

    const context: IngestionSagaContext = {
      input,
      attempt,
      isFinalAttempt,
      chunks: [],
      embeddings: [],
    };

    const steps: SagaStep<IngestionSagaContext>[] = [
      {
        name: 'MarkDocumentProcessing',
        execute: async (ctx) => {
          await this.rlsTransaction.runWithTenant(
            ctx.input.tenantId,
            async (manager) => {
              await manager.getRepository(DocumentEntity).update(
                { id: ctx.input.documentId },
                { status: DocumentStatus.PROCESSING, errorMessage: null },
              );
            },
          );
        },
        compensate: async (ctx, error) => {
          const safeErrorMsg = maskPii(error.message || 'Ingestion error');
          await this.rlsTransaction.runWithTenant(
            ctx.input.tenantId,
            async (manager) => {
              await manager
                .getRepository(ChunkEntity)
                .delete({ documentId: ctx.input.documentId });
              await manager.getRepository(DocumentEntity).update(
                { id: ctx.input.documentId },
                {
                  status: ctx.isFinalAttempt
                    ? DocumentStatus.FAILED
                    : DocumentStatus.UPLOADED,
                  errorMessage: safeErrorMsg,
                },
              );
            },
          );
        },
      },
      {
        name: 'ParseDocumentContent',
        execute: async (ctx) => {
          const parser = this.parserFactory.getParser(ctx.input.type);
          ctx.parsed = await parser.parse({
            type: ctx.input.type,
            buffer: ctx.input.buffer,
            rawText: ctx.input.rawText,
            sourceUrl: ctx.input.sourceUrl,
          });
        },
        compensate: async (ctx) => {
          ctx.parsed = undefined;
        },
      },
      {
        name: 'ChunkAndEmbedVectors',
        execute: async (ctx) => {
          if (!ctx.parsed) {
            throw new Error('Parsed document output is missing');
          }
          const chunkingStrategy = this.chunkingResolver.resolve(
            ctx.input.type,
          );
          ctx.chunks = chunkingStrategy.split(
            ctx.parsed.text,
            ctx.parsed.metadata,
          );
          if (ctx.chunks.length === 0) {
            throw new Error('Document produced zero text chunks after parsing');
          }
          ctx.embeddings = await this.embeddingsService.embedBatch(
            ctx.chunks.map((c) => c.content),
          );
        },
        compensate: async (ctx) => {
          ctx.chunks = [];
          ctx.embeddings = [];
        },
      },
      {
        name: 'PersistPgVectorChunksAndMarkReady',
        execute: async (ctx) => {
          await this.rlsTransaction.runWithTenant(
            ctx.input.tenantId,
            async (manager) => {
              const chunkRepo = manager.getRepository(ChunkEntity);
              const docRepo = manager.getRepository(DocumentEntity);

              await chunkRepo.delete({ documentId: ctx.input.documentId });

              for (let i = 0; i < ctx.chunks.length; i++) {
                const vectorLiteral = this.embeddingsService.toPgVectorLiteral(
                  ctx.embeddings[i],
                );
                await manager.query(
                  `INSERT INTO "chunks" ("tenant_id", "document_id", "chunk_index", "content", "metadata", "embedding")
                   VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector)`,
                  [
                    ctx.input.tenantId,
                    ctx.input.documentId,
                    ctx.chunks[i].chunkIndex,
                    ctx.chunks[i].content,
                    JSON.stringify(ctx.chunks[i].metadata),
                    vectorLiteral,
                  ],
                );
              }

              await docRepo.update(
                { id: ctx.input.documentId },
                { status: DocumentStatus.READY, errorMessage: null },
              );
            },
          );
        },
        compensate: async (ctx) => {
          await this.rlsTransaction.runWithTenant(
            ctx.input.tenantId,
            async (manager) => {
              await manager
                .getRepository(ChunkEntity)
                .delete({ documentId: ctx.input.documentId });
            },
          );
        },
      },
    ];

    const orchestrator = new SagaOrchestrator<IngestionSagaContext>(
      'DocumentIngestionSaga',
      steps,
    );
    const sagaResult = await orchestrator.run(context);

    if (sagaResult.succeeded) {
      return {
        status: DocumentStatus.READY,
        chunkCount: context.chunks.length,
        attempt,
        routedToDlq: false,
        rolledBack: false,
        completedSteps: sagaResult.completedSteps,
        compensatedSteps: [],
      };
    }

    const safeErrorMsg = maskPii(
      sagaResult.error?.message || 'Ingestion error',
    );
    this.logger.warn(
      `Ingestion Saga rolled back for document ${input.documentId} (attempt ${attempt}/${this.maxRetries}): ${safeErrorMsg}`,
    );

    // Queue next retry attempt (1 -> 2 -> 3) or route to Dead-Letter Queue on attempt > 3 (FR-3)
    await this.rabbitMqService.publishIngestionJob({
      tenantId: input.tenantId,
      documentId: input.documentId,
      attempt: attempt + 1,
    });

    return {
      status: isFinalAttempt ? DocumentStatus.FAILED : DocumentStatus.PROCESSING,
      chunkCount: 0,
      attempt,
      routedToDlq: isFinalAttempt,
      rolledBack: sagaResult.rolledBack,
      completedSteps: sagaResult.completedSteps,
      compensatedSteps: sagaResult.compensatedSteps,
    };
  }
}
