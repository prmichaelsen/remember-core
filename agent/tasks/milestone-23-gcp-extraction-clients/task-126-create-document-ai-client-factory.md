# Task 126: Create DocumentAiClient Factory

**Milestone**: [M23 - GCP Extraction Clients](../../milestones/milestone-23-gcp-extraction-clients.md)
**Estimated Time**: 1-2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Implement `createDocumentAiClient()` factory that returns a `DocumentAiClient` using `@google-cloud/documentai`.

---

## Steps

### 1. Add Peer Dependency

Add `@google-cloud/documentai` as an optional peer dependency in `package.json`.

### 2. Create Factory

In `src/services/extractors/documentai.client.ts`:

```typescript
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
        // Approximate page text length from layout
        const pageText = page.layout?.textAnchor?.textSegments?.[0];
        if (pageText?.endIndex) {
          offset = Number(pageText.endIndex);
        }
      }

      return { text, metadata, page_boundaries: pageBoundaries };
    },
  };
}
```

### 3. Export from Barrel

Add to `src/services/extractors/index.ts` and `src/services/index.ts`.

### 4. Write Unit Test

- Mock `@google-cloud/documentai`
- Verify `extractText` calls `client.processDocument` with base64 content
- Verify empty document returns empty text
- Verify page boundaries extracted

---

## Verification

- [ ] `createDocumentAiClient()` exported from `@prmichaelsen/remember-core/services`
- [ ] Returns `DocumentAiClient` conforming to interface
- [ ] `@google-cloud/documentai` is optional peer dep
- [ ] Unit tests pass
- [ ] Build passes
