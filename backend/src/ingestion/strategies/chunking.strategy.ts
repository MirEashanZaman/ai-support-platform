import { Injectable } from '@nestjs/common';
import { DocumentType } from '../../common/enums/document-status.enum';

export interface TextChunkResult {
  chunkIndex: number;
  content: string;
  metadata: Record<string, unknown>;
}

export interface ChunkingStrategy {
  readonly strategyName: string;
  split(
    text: string,
    baseMetadata?: Record<string, unknown>,
  ): TextChunkResult[];
}

/**
 * Sliding Window Chunking Strategy (for PDF, TXT, and URL documents).
 * Splits text into overlapping windows (default 500 chars, 80 chars overlap)
 * while respecting word boundaries where possible.
 */
export class SlidingWindowChunkingStrategy implements ChunkingStrategy {
  readonly strategyName = 'sliding-window';

  constructor(
    private readonly maxChars = 500,
    private readonly overlap = 80,
  ) {}

  split(
    text: string,
    baseMetadata: Record<string, unknown> = {},
  ): TextChunkResult[] {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return [];
    if (cleaned.length <= this.maxChars) {
      return [
        {
          chunkIndex: 0,
          content: cleaned,
          metadata: { ...baseMetadata, strategy: this.strategyName, chunkIndex: 0 },
        },
      ];
    }

    const results: TextChunkResult[] = [];
    let start = 0;
    let index = 0;

    while (start < cleaned.length) {
      let end = Math.min(start + this.maxChars, cleaned.length);
      if (end < cleaned.length) {
        const lastSpace = cleaned.lastIndexOf(' ', end);
        if (lastSpace > start + Math.floor(this.maxChars * 0.6)) {
          end = lastSpace;
        }
      }

      const slice = cleaned.slice(start, end).trim();
      if (slice) {
        results.push({
          chunkIndex: index,
          content: slice,
          metadata: {
            ...baseMetadata,
            strategy: this.strategyName,
            chunkIndex: index,
            charStart: start,
            charEnd: end,
          },
        });
        index++;
      }

      if (end >= cleaned.length) break;
      start = Math.max(start + 1, end - this.overlap);
    }

    return results;
  }
}

/**
 * Markdown Heading-Aware Chunking Strategy (Tech Decisions Section 3 Strategy Pattern).
 * Splits Markdown documents by `#`, `##`, `###` headings and preserves the section title
 * inside each chunk's metadata for high-precision RAG citations.
 */
export class MarkdownChunkingStrategy implements ChunkingStrategy {
  readonly strategyName = 'markdown-heading';
  private readonly fallbackWindow = new SlidingWindowChunkingStrategy(500, 80);

  split(
    text: string,
    baseMetadata: Record<string, unknown> = {},
  ): TextChunkResult[] {
    const trimmed = text.trim();
    if (!trimmed) return [];

    const lines = trimmed.split(/\r?\n/);
    const sections: Array<{ heading: string; body: string }> = [];
    let currentHeading = 'Introduction';
    let currentLines: string[] = [];

    for (const line of lines) {
      const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line.trim());
      if (headingMatch) {
        if (currentLines.length > 0) {
          sections.push({
            heading: currentHeading,
            body: currentLines.join(' ').replace(/\s+/g, ' ').trim(),
          });
          currentLines = [];
        }
        currentHeading = headingMatch[2].trim();
      } else if (line.trim()) {
        currentLines.push(line.trim());
      }
    }

    if (currentLines.length > 0) {
      sections.push({
        heading: currentHeading,
        body: currentLines.join(' ').replace(/\s+/g, ' ').trim(),
      });
    }

    const chunks: TextChunkResult[] = [];
    let index = 0;

    for (const section of sections) {
      if (!section.body) continue;
      const prefixed = `${section.heading}: ${section.body}`;
      if (prefixed.length <= 500) {
        chunks.push({
          chunkIndex: index,
          content: prefixed,
          metadata: {
            ...baseMetadata,
            strategy: this.strategyName,
            sectionHeading: section.heading,
            chunkIndex: index,
          },
        });
        index++;
      } else {
        const subChunks = this.fallbackWindow.split(prefixed, {
          ...baseMetadata,
          sectionHeading: section.heading,
        });
        for (const sub of subChunks) {
          chunks.push({
            chunkIndex: index,
            content: sub.content,
            metadata: {
              ...sub.metadata,
              strategy: this.strategyName,
              chunkIndex: index,
            },
          });
          index++;
        }
      }
    }

    return chunks;
  }
}

@Injectable()
export class ChunkingStrategyResolver {
  private readonly slidingStrategy = new SlidingWindowChunkingStrategy(500, 80);
  private readonly markdownStrategy = new MarkdownChunkingStrategy();

  resolve(type: DocumentType): ChunkingStrategy {
    if (type === DocumentType.MARKDOWN) {
      return this.markdownStrategy;
    }
    return this.slidingStrategy;
  }
}
