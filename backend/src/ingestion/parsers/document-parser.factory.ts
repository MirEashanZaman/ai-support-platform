import { BadRequestException, Injectable } from '@nestjs/common';
import * as pdfParse from 'pdf-parse';
import { DocumentType } from '../../common/enums/document-status.enum';

export interface ParsedDocumentOutput {
  text: string;
  metadata: {
    parser: string;
    pageCount?: number;
    sourceUrl?: string;
    characterCount: number;
  };
}

export interface DocumentParserInput {
  type: DocumentType;
  buffer?: Buffer;
  rawText?: string;
  sourceUrl?: string;
}

export interface DocumentParser {
  parse(input: DocumentParserInput): Promise<ParsedDocumentOutput>;
}

export class PdfDocumentParser implements DocumentParser {
  async parse(input: DocumentParserInput): Promise<ParsedDocumentOutput> {
    if (input.rawText && input.rawText.trim().length > 0) {
      const cleaned = input.rawText.trim();
      return {
        text: cleaned,
        metadata: {
          parser: 'pdf-text',
          pageCount: 1,
          characterCount: cleaned.length,
        },
      };
    }

    if (!input.buffer || input.buffer.length === 0) {
      throw new BadRequestException('PDF document requires a file buffer or text');
    }

    const header = input.buffer.subarray(0, 5).toString('utf8');
    if (header.startsWith('%PDF-')) {
      const parseFn =
        (pdfParse as unknown as { default?: typeof pdfParse }).default ??
        pdfParse;
      const parsed = await parseFn(input.buffer);
      const text = (parsed.text || '').trim();
      if (!text) {
        throw new BadRequestException('PDF file contained no extractable text');
      }
      return {
        text,
        metadata: {
          parser: 'pdf-parse',
          pageCount: parsed.numpages ?? 1,
          characterCount: text.length,
        },
      };
    }

    const fallbackText = input.buffer.toString('utf8').trim();
    if (!fallbackText) {
      throw new BadRequestException('Empty PDF buffer');
    }
    return {
      text: fallbackText,
      metadata: {
        parser: 'pdf-buffer-utf8',
        pageCount: 1,
        characterCount: fallbackText.length,
      },
    };
  }
}

export class TextDocumentParser implements DocumentParser {
  async parse(input: DocumentParserInput): Promise<ParsedDocumentOutput> {
    const text = (
      input.rawText ??
      input.buffer?.toString('utf8') ??
      ''
    ).trim();

    if (!text) {
      throw new BadRequestException('TXT document is empty');
    }

    return {
      text,
      metadata: {
        parser: 'txt',
        characterCount: text.length,
      },
    };
  }
}

export class MarkdownDocumentParser implements DocumentParser {
  async parse(input: DocumentParserInput): Promise<ParsedDocumentOutput> {
    const text = (
      input.rawText ??
      input.buffer?.toString('utf8') ??
      ''
    ).trim();

    if (!text) {
      throw new BadRequestException('Markdown document is empty');
    }

    return {
      text,
      metadata: {
        parser: 'markdown',
        characterCount: text.length,
      },
    };
  }
}

export class UrlDocumentParser implements DocumentParser {
  async parse(input: DocumentParserInput): Promise<ParsedDocumentOutput> {
    let htmlOrText = input.rawText ?? '';

    if (!htmlOrText && input.sourceUrl) {
      const response = await fetch(input.sourceUrl, {
        headers: { 'User-Agent': 'AISupportPlatformBot/1.0' },
      });
      if (!response.ok) {
        throw new BadRequestException(
          `Failed to fetch URL (${response.status}): ${input.sourceUrl}`,
        );
      }
      htmlOrText = await response.text();
    }

    const cleanedText = UrlDocumentParser.extractCleanTextFromHtml(htmlOrText);
    if (!cleanedText) {
      throw new BadRequestException('No readable text found at URL');
    }

    return {
      text: cleanedText,
      metadata: {
        parser: 'url-html-cleaner',
        sourceUrl: input.sourceUrl,
        characterCount: cleanedText.length,
      },
    };
  }

  static extractCleanTextFromHtml(html: string): string {
    if (!html) return '';
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

@Injectable()
export class DocumentParserFactory {
  private readonly pdfParser = new PdfDocumentParser();
  private readonly txtParser = new TextDocumentParser();
  private readonly mdParser = new MarkdownDocumentParser();
  private readonly urlParser = new UrlDocumentParser();

  getParser(type: DocumentType): DocumentParser {
    switch (type) {
      case DocumentType.PDF:
        return this.pdfParser;
      case DocumentType.TXT:
        return this.txtParser;
      case DocumentType.MARKDOWN:
        return this.mdParser;
      case DocumentType.URL:
        return this.urlParser;
      default:
        throw new BadRequestException(`Unsupported document type: ${String(type)}`);
    }
  }
}
