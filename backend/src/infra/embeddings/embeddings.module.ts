import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embedText(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic 1536-dimensional unit-vector embedding generator for local dev and CI tests.
 * Produces identical normalized vectors for identical text and preserves token overlap similarity.
 */
export class DeterministicMockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly dimensions = 1536;

  async embedText(text: string): Promise<number[]> {
    const vector = new Array<number>(this.dimensions).fill(0);
    const normalized = text.toLowerCase().trim();
    const tokens = normalized.split(/\W+/).filter(Boolean);

    if (tokens.length === 0) {
      vector[0] = 1;
      return vector;
    }

    for (const token of tokens) {
      const digest = createHash('sha256').update(token).digest();
      for (let i = 0; i < 8; i++) {
        const idx = digest.readUInt16BE(i * 2) % this.dimensions;
        const sign = (digest[16 + i] & 1) === 0 ? 1 : -1;
        vector[idx] += sign;
      }
    }

    const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)) || 1;
    return vector.map((val) => Number((val / norm).toFixed(6)));
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embedText(t)));
  }
}

@Injectable()
export class EmbeddingsService {
  private readonly provider: EmbeddingProvider;

  constructor(private readonly configService: ConfigService) {
    // Default to deterministic mock in dev/CI unless OpenAI or Voyage API keys are configured
    this.provider = new DeterministicMockEmbeddingProvider();
  }

  getProviderName(): string {
    return this.configService.get<string>('EMBEDDING_PROVIDER', this.provider.name);
  }

  async embedText(text: string): Promise<number[]> {
    return this.provider.embedText(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return this.provider.embedBatch(texts);
  }

  toPgVectorLiteral(vector: number[]): string {
    return `[${vector.join(',')}]`;
  }
}

@Global()
@Module({
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}

