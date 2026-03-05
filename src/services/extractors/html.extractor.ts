import type { FileExtractor, ExtractionResult } from './types.js';

export class HtmlExtractor implements FileExtractor {
  readonly supportedMimeTypes = ['text/html'];

  async extract(content: Buffer, _mimeType: string): Promise<ExtractionResult> {
    const TurndownService = (await import('turndown')).default;
    const turndown = new TurndownService({ headingStyle: 'atx' });
    const markdown = turndown.turndown(content.toString('utf-8'));
    return { text: markdown, metadata: {} };
  }
}
