import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EmbeddingsService } from '../../infra/embeddings/embeddings.module';

export interface RetrievedChunk {
  chunkId: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  content: string;
  similarity: number;
}

export interface VectorStorePort {
  searchSimilarChunks(
    manager: EntityManager,
    query: string,
    limit?: number,
  ): Promise<RetrievedChunk[]>;
}

@Injectable()
export class PgVectorStoreAdapter implements VectorStorePort {
  constructor(private readonly embeddingsService: EmbeddingsService) {}

  async searchSimilarChunks(
    manager: EntityManager,
    query: string,
    limit = 4,
  ): Promise<RetrievedChunk[]> {
    const queryVector = await this.embeddingsService.embedText(query);
    const vectorLiteral = this.embeddingsService.toPgVectorLiteral(queryVector);

    const rows: Array<{
      id: string;
      document_id: string;
      document_name: string;
      chunk_index: number;
      content: string;
      similarity: number;
    }> = await manager.query(
      `SELECT c.id,
              c.document_id,
              d.name AS document_name,
              c.chunk_index,
              c.content,
              1 - (c.embedding <=> $1::vector) AS similarity
       FROM "chunks" c
       INNER JOIN "documents" d ON d.id = c.document_id
       WHERE d.status = 'Ready'
       ORDER BY c.embedding <=> $1::vector ASC
       LIMIT $2`,
      [vectorLiteral, limit],
    );

    return rows.map((row) => ({
      chunkId: row.id,
      documentId: row.document_id,
      documentName: row.document_name,
      chunkIndex: Number(row.chunk_index ?? 0),
      content: row.content,
      similarity: Number(Number(row.similarity ?? 0).toFixed(4)),
    }));
  }
}
