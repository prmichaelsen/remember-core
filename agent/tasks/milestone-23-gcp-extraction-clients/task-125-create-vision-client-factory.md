# Task 125: Create VisionClient Factory

**Milestone**: [M23 - GCP Extraction Clients](../../milestones/milestone-23-gcp-extraction-clients.md)
**Estimated Time**: 1-2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Implement `createVisionClient()` factory that returns a `VisionClient` using `@google-cloud/vision`.

---

## Steps

### 1. Add Peer Dependency

Add `@google-cloud/vision` as an optional peer dependency in `package.json`.

### 2. Create Factory

In `src/services/extractors/vision.client.ts`:

```typescript
import type { VisionClient } from './image.extractor.js';

export interface VisionClientConfig {
  serviceAccountKey: string | object;
}

export function createVisionClient(config: VisionClientConfig): VisionClient {
  // Lazy import to avoid requiring the SDK when not used
  const { ImageAnnotatorClient } = require('@google-cloud/vision');

  const credentials = typeof config.serviceAccountKey === 'string'
    ? JSON.parse(config.serviceAccountKey)
    : config.serviceAccountKey;

  const client = new ImageAnnotatorClient({ credentials });

  return {
    async detectText(content: Buffer): Promise<string> {
      const [result] = await client.textDetection({ image: { content } });
      const detections = result.textAnnotations ?? [];
      return detections[0]?.description ?? '';
    },
  };
}
```

### 3. Export from Barrel

Add to `src/services/extractors/index.ts` and `src/services/index.ts`.

### 4. Write Unit Test

- Mock `@google-cloud/vision`
- Verify `detectText` calls `client.textDetection` with buffer
- Verify empty annotations returns empty string

---

## Verification

- [ ] `createVisionClient()` exported from `@prmichaelsen/remember-core/services`
- [ ] Returns `VisionClient` conforming to interface
- [ ] `@google-cloud/vision` is optional peer dep
- [ ] Unit tests pass
- [ ] Build passes
