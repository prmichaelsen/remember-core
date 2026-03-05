export interface ExtractionResult {
  /** Extracted plain text / Markdown content */
  text: string;
  /** Document metadata (title, author, page count, etc.) */
  metadata: Record<string, string>;
  /** Page boundaries for chunk markers (index = page number, value = char offset) */
  page_boundaries?: number[];
}

export interface FileExtractor {
  /** MIME types this extractor handles */
  readonly supportedMimeTypes: string[];
  /** Extract text from file content */
  extract(content: Buffer, mimeType: string): Promise<ExtractionResult>;
}
