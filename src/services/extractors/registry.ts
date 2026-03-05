import type { FileExtractor } from './types.js';
import { PlaintextExtractor } from './plaintext.extractor.js';
import { HtmlExtractor } from './html.extractor.js';

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
export function createDefaultRegistry(): ExtractorRegistry {
  const registry = new ExtractorRegistry();
  registry.register(new PlaintextExtractor());
  registry.register(new HtmlExtractor());
  return registry;
}
