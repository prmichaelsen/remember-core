# Task 127: Wire GCP Clients into remember-rest-service

**Milestone**: [M23 - GCP Extraction Clients](../../milestones/milestone-23-gcp-extraction-clients.md)
**Estimated Time**: 1-2 hours
**Dependencies**: task-125, task-126
**Status**: Not Started
**Project**: remember-rest-service (cross-project task)

---

## Objective

Install GCP SDK peer deps in remember-rest-service, create GCloud secrets for the service account key, and update the EXTRACTOR_REGISTRY provider to pass VisionClient and DocumentAiClient to `createDefaultRegistry()`.

---

## Steps

### 1. Create GCloud Secrets

```bash
# Upload the service account key
gcloud secrets create remember-doc-ai-service-account-key \
  --data-file=agentbase-doc-ai-service.json

# Create processor ID secret
gcloud secrets create remember-doc-ai-processor-id \
  --data-file=- <<< "<processor-id>"
```

### 2. Install GCP SDKs

In remember-rest-service:
```bash
npm install @google-cloud/vision @google-cloud/documentai
```

### 3. Add Config Properties

In `src/config/config.service.ts`, add extraction config:
```typescript
get extractionConfig() {
  return {
    gcpServiceAccountKey: process.env.GCP_DOC_AI_SERVICE_ACCOUNT_KEY,
    documentAiProcessorId: process.env.DOCUMENT_AI_PROCESSOR_ID,
    documentAiLocation: process.env.DOCUMENT_AI_LOCATION || 'us',
  };
}
```

### 4. Update EXTRACTOR_REGISTRY Provider

In `src/core/core.providers.ts`:
```typescript
import { createDefaultRegistry, createVisionClient, createDocumentAiClient } from '@prmichaelsen/remember-core/services';

export const extractorRegistryProvider: Provider = {
  provide: EXTRACTOR_REGISTRY,
  useFactory: (configService: ConfigService) => {
    const { gcpServiceAccountKey, documentAiProcessorId, documentAiLocation } = configService.extractionConfig;

    const visionClient = gcpServiceAccountKey
      ? createVisionClient({ serviceAccountKey: gcpServiceAccountKey })
      : undefined;

    const documentAiClient = gcpServiceAccountKey && documentAiProcessorId
      ? createDocumentAiClient({
          serviceAccountKey: gcpServiceAccountKey,
          processorId: documentAiProcessorId,
          location: documentAiLocation,
        })
      : undefined;

    return createDefaultRegistry({ visionClient, documentAiClient });
  },
  inject: [ConfigService],
};
```

### 5. Update Cloud Build

Add secrets to `cloudbuild.yaml` and `cloudbuild.e1.yaml`.

### 6. Update Tests

Ensure existing tests still pass with mock registry.

---

## Verification

- [ ] GCloud secrets created
- [ ] GCP SDKs installed
- [ ] Config properties added
- [ ] EXTRACTOR_REGISTRY provider creates clients when credentials available
- [ ] Graceful fallback when credentials not set
- [ ] Cloud Build configs updated
- [ ] All tests pass
