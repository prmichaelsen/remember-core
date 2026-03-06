# Milestone 23: GCP Extraction Clients

**Status**: Not Started
**Estimated Duration**: 1 week
**Dependencies**: M17 (File Format Extraction)

---

## Goal

Add concrete factory functions for Google Cloud Vision (image OCR) and Document AI (scanned PDF OCR) clients. These implement the existing `VisionClient` and `DocumentAiClient` interfaces so consumers (remember-rest-service, remember-mcp-server) can pass them to `createDefaultRegistry()` without implementing GCP SDK wiring themselves.

---

## Deliverables

### 1. `createVisionClient()` Factory
- Accepts `{ serviceAccountKey: string | object }` (GCP service account JSON)
- Returns a `VisionClient` implementing `detectText(content: Buffer): Promise<string>`
- Uses `@google-cloud/vision` SDK
- Peer dependency on `@google-cloud/vision`

### 2. `createDocumentAiClient()` Factory
- Accepts `{ serviceAccountKey: string | object, processorId: string, location?: string }`
- Returns a `DocumentAiClient` implementing `extractText(content: Buffer): Promise<ExtractionResult>`
- Uses `@google-cloud/documentai` SDK
- Peer dependency on `@google-cloud/documentai`

### 3. Exports
- Both factories exported from `@prmichaelsen/remember-core/services`
- Type exports for config interfaces

### 4. Updated `createDefaultRegistry()`
- Accept optional `visionClient` and `documentAiClient` in deps (already does)
- No changes needed — the registry already supports these

---

## Success Criteria

- [ ] `createVisionClient()` returns working VisionClient
- [ ] `createDocumentAiClient()` returns working DocumentAiClient
- [ ] Both factories exported from barrel
- [ ] GCP SDKs listed as optional peer dependencies
- [ ] Unit tests with mocked GCP clients
- [ ] Build passes, typecheck passes

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| GCP SDK size bloat | Larger install | Peer deps — only installed by consumers that need OCR |
| GCP auth complexity | Hard to test | Accept service account JSON directly, no ADC magic |

---

## Related

- `src/services/extractors/image.extractor.ts` — VisionClient interface
- `src/services/extractors/pdf.extractor.ts` — DocumentAiClient interface
- `src/services/extractors/registry.ts` — createDefaultRegistry()
