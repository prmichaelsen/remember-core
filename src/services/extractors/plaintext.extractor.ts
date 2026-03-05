import type { FileExtractor, ExtractionResult } from './types.js';

export class PlaintextExtractor implements FileExtractor {
  readonly supportedMimeTypes = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'application/x-yaml',
    'text/yaml',
  ];

  async extract(content: Buffer, _mimeType: string): Promise<ExtractionResult> {
    return { text: content.toString('utf-8'), metadata: {} };
  }
}
