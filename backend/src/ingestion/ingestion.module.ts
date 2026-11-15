import { Global, Injectable, Module } from '@nestjs/common';
import { DocumentType } from '../common/enums/document-status.enum';
import {
  ExecuteIngestionJobResult,
  IngestionSagaService,
} from './ingestion-saga.service';
import { DocumentParserFactory } from './parsers/document-parser.factory';
import {
  ChunkingStrategyResolver,
  SlidingWindowChunkingStrategy,
} from './strategies/chunking.strategy';

@Injectable()
export class IngestionService {
  constructor(
    private readonly ingestionSaga: IngestionSagaService,
    private readonly chunkingResolver: ChunkingStrategyResolver,
  ) {}

  async ingestDocumentText(
    tenantId: string,
    documentId: string,
    rawText: string,
    type: DocumentType = DocumentType.TXT,
    attempt = 1,
  ): Promise<ExecuteIngestionJobResult> {
    return this.ingestionSaga.execute({
      tenantId,
      documentId,
      type,
      rawText,
      attempt,
    });
  }

  chunkText(text: string, maxChars = 500, overlap = 80): string[] {
    const strategy = new SlidingWindowChunkingStrategy(maxChars, overlap);
    return strategy.split(text).map((c) => c.content);
  }
}

@Global()
@Module({
  providers: [
    DocumentParserFactory,
    ChunkingStrategyResolver,
    IngestionSagaService,
    IngestionService,
  ],
  exports: [
    DocumentParserFactory,
    ChunkingStrategyResolver,
    IngestionSagaService,
    IngestionService,
  ],
})
export class IngestionModule {}
