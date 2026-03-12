export type { ExtractionResult, FileExtractor } from './types.js';
export { ExtractorRegistry, createDefaultRegistry } from './registry.js';
export { downloadFile } from './download.js';
export { PlaintextExtractor } from './plaintext.extractor.js';
export { HtmlExtractor } from './html.extractor.js';
export { PdfExtractor } from './pdf.extractor.js';
export type { DocumentAiClient, Logger } from './pdf.extractor.js';
export { DocxExtractor } from './docx.extractor.js';
export { ImageExtractor } from './image.extractor.js';
export type { VisionClient } from './image.extractor.js';
export { createVisionClient, type VisionClientConfig } from './vision.client.js';
export { createDocumentAiClient, type DocumentAiClientConfig } from './documentai.client.js';
export { validateImportItems, type ValidationError } from './validation.js';
export { mimeFromFilename } from './mime-map.js';

/** MIME types supported for file import */
export const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html',
  'text/plain',
  'text/markdown',
  // Images (OCR)
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/tiff',
  // Structured data
  'text/csv',
  'application/json',
  'application/x-yaml',
  'text/yaml',
  // Archives
  'application/zip',
] as const;
