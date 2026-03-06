import type { DocumentAiClient } from './pdf.extractor.js';
import type { ExtractionResult } from './types.js';

export interface DocumentAiClientConfig {
  serviceAccountKey: string | object;
  processorId: string;
  location?: string;
}

export function createDocumentAiClient(config: DocumentAiClientConfig): DocumentAiClient {
  const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');

  const credentials = typeof config.serviceAccountKey === 'string'
    ? JSON.parse(config.serviceAccountKey)
    : config.serviceAccountKey;

  const location = config.location ?? 'us';
  const client = new DocumentProcessorServiceClient({ credentials });
  const processorName = `projects/${credentials.project_id}/locations/${location}/processors/${config.processorId}`;

  return {
    async extractText(content: Buffer): Promise<ExtractionResult> {
      const [result] = await client.processDocument({
        name: processorName,
        rawDocument: {
          content: content.toString('base64'),
          mimeType: 'application/pdf',
        },
      });

      const text = result.document?.text ?? '';
      const metadata: Record<string, string> = {};

      const pages = result.document?.pages ?? [];
      metadata.pages = String(pages.length);

      const pageBoundaries: number[] = [];
      let offset = 0;
      for (const page of pages) {
        pageBoundaries.push(offset);
        const pageText = page.layout?.textAnchor?.textSegments?.[0];
        if (pageText?.endIndex) {
          offset = Number(pageText.endIndex);
        }
      }

      return { text, metadata, page_boundaries: pageBoundaries };
    },
  };
}
