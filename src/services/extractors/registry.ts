import type { FileExtractor } from './types.js';

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
 * Initially empty — extractors are registered in later tasks.
 */
export function createDefaultRegistry(): ExtractorRegistry {
  return new ExtractorRegistry();
}
