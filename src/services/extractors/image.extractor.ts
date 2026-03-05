import type { FileExtractor, ExtractionResult } from './types.js';

export interface VisionClient {
  detectText(content: Buffer): Promise<string>;
}

export class ImageExtractor implements FileExtractor {
  readonly supportedMimeTypes = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/tiff',
  ];

  constructor(private visionClient: VisionClient) {}

  async extract(content: Buffer, _mimeType: string): Promise<ExtractionResult> {
    const text = await this.visionClient.detectText(content);
    return { text, metadata: {} };
  }
}
