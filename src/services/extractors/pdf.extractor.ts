import type { FileExtractor, ExtractionResult } from './types.js';

export interface DocumentAiClient {
  extractText(content: Buffer): Promise<ExtractionResult>;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

const SCANNED_THRESHOLD = 50;

export class PdfExtractor implements FileExtractor {
  readonly supportedMimeTypes = ['application/pdf'];

  constructor(
    private documentAiClient?: DocumentAiClient,
    private logger?: Logger,
  ) {}

  async extract(content: Buffer, _mimeType: string): Promise<ExtractionResult> {
    const { extractText, getMeta } = await import('unpdf');

    // Extract text per-page to get page boundaries
    const { text: pages, totalPages } = await extractText(
      new Uint8Array(content),
    );

    const fullText = pages.join('\n\n');

    // If text is near-empty and Document AI is available, fall back to OCR
    if (fullText.trim().length < SCANNED_THRESHOLD && this.documentAiClient) {
      this.logger?.info('PDF has no text layer, falling back to Document AI OCR');
      return this.documentAiClient.extractText(content);
    }

    // Extract metadata
    const metadata: Record<string, string> = {};
    try {
      const { info } = await getMeta(new Uint8Array(content));
      if (info.Title) metadata.title = String(info.Title);
      if (info.Author) metadata.author = String(info.Author);
      if (info.CreationDate) metadata.created = String(info.CreationDate);
    } catch {
      // Metadata extraction is best-effort
    }
    metadata.pages = String(totalPages);

    // Compute page boundaries (character offset where each page starts)
    const pageBoundaries: number[] = [];
    let offset = 0;
    for (const page of pages) {
      pageBoundaries.push(offset);
      offset += page.length + 2; // +2 for '\n\n' separator
    }

    return {
      text: fullText,
      metadata,
      page_boundaries: pageBoundaries,
    };
  }
}
