import type { FileExtractor, ExtractionResult } from './types.js';

export class DocxExtractor implements FileExtractor {
  readonly supportedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  async extract(content: Buffer, _mimeType: string): Promise<ExtractionResult> {
    const mammoth = await import('mammoth');
    const TurndownService = (await import('turndown')).default;

    const { value: html } = await mammoth.convertToHtml({ buffer: content });

    const turndown = new TurndownService({ headingStyle: 'atx' });
    const markdown = turndown.turndown(html);

    return { text: markdown, metadata: {} };
  }
}
