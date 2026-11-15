import { Injectable, Module } from '@nestjs/common';
import {
  ChunkEntity,
  DocumentEntity,
} from '../database/entities';
import { DocumentStatus } from '../common/enums/document-status.enum';
import { RlsTransactionService } from '../database/rls-transaction.service';
import { EmbeddingsService } from '../infra/embeddings/embeddings.module';

@Injectable()
export class IngestionService {
  constructor(
    private readonly rlsTransaction: RlsTransactionService,
    private readonly embeddingsService: EmbeddingsService,
  ) {}

  /**
   * Splits raw document text into overlapping chunks, generates embeddings via the
   * configured EmbeddingProvider, and saves them in pgvector under the tenant's RLS context.
   */
  async ingestDocumentText(
    tenantId: string,
    documentId: string,
    rawText: string,
  ): Promise<{ chunkCount: number }> {
    return this.rlsTransaction.runWithTenant(tenantId, async (manager) => {
      const docRepo = manager.getRepository(DocumentEntity);
      const chunkRepo = manager.getRepository(ChunkEntity);

      await docRepo.update(
        { id: documentId },
        { status: DocumentStatus.PROCESSING },
      );

      const textChunks = this.chunkText(rawText, 500, 80);
      const vectors = await this.embeddingsService.embedBatch(textChunks);

      await chunkRepo.delete({ documentId });

      for (let i = 0; i < textChunks.length; i++) {
        const vectorLiteral = this.embeddingsService.toPgVectorLiteral(
          vectors[i],
        );
        await manager.query(
          `INSERT INTO "chunks" ("tenant_id", "document_id", "chunk_index", "content", "metadata", "embedding")
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::vector)`,
          [
            tenantId,
            documentId,
            i,
            textChunks[i],
            JSON.stringify({ chunkIndex: i }),
            vectorLiteral,
          ],
        );
      }

      await docRepo.update(
        { id: documentId },
        { status: DocumentStatus.READY, errorMessage: null },
      );

      return { chunkCount: textChunks.length };
    });
  }

  chunkText(text: string, maxChars = 500, overlap = 80): string[] {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];
    if (cleaned.length <= maxChars) return [cleaned];

    const chunks: string[] = [];
    let start = 0;
    while (start < cleaned.length) {
      const end = Math.min(start + maxChars, cleaned.length);
      chunks.push(cleaned.slice(start, end).trim());
      if (end >= cleaned.length) break;
      start = Math.max(0, end - overlap);
    }
    return chunks;
  }
}

@Module({
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}

