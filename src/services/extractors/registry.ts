import type { FileExtractor } from './types.js';
import { PlaintextExtractor } from './plaintext.extractor.js';
import { HtmlExtractor } from './html.extractor.js';
import { PdfExtractor } from './pdf.extractor.js';
import type { DocumentAiClient, Logger } from './pdf.extractor.js';
import { DocxExtractor } from './docx.extractor.js';
import { ImageExtractor } from './image.extractor.js';
import type { VisionClient } from './image.extractor.js';

export class ExtractorRegistry {
  private extractors: FileExtractor[] = [];

  register(extractor: FileExtractor): void {
    this.extractors.push(extractor);
  }

  getExtractor(mimeType: string): FileExtractor | null {
    return this.extractors.find(e => e.supportedMimeTypes.includes(mimeType)) ?? null;
  }

  getSupportedMimeTypes(): string[] {
    return this.extractors.flatMap(e => e.supportedMimeTypes);
  }
}

/**
 * Create a registry with all built-in extractors.
 * Cloud clients are optional — if not provided, those extractors are skipped.
 */
export function createDefaultRegistry(deps?: {
  documentAiClient?: DocumentAiClient;
  visionClient?: VisionClient;
  logger?: Logger;
}): ExtractorRegistry {
  const registry = new ExtractorRegistry();
  registry.register(new PlaintextExtractor());
  registry.register(new HtmlExtractor());
  registry.register(new PdfExtractor(deps?.documentAiClient, deps?.logger));
  registry.register(new DocxExtractor());
  if (deps?.visionClient) {
    registry.register(new ImageExtractor(deps.visionClient));
  }
  return registry;
}
