# Task 87: PDF Extractor

**Milestone**: [M17 - File Format Extraction](../../milestones/milestone-17-file-format-extraction.md)
**Estimated Time**: 3-4 hours
**Dependencies**: task-85
**Status**: Not Started

---

## Objective

Implement `PdfExtractor` with hybrid strategy: extract text-layer via `unpdf` (free, in-process), detect scanned/image-only PDFs, and fall back to Google Document AI for OCR.

---

## Context

Most PDFs have a text layer and can be extracted quickly with unpdf (a modern PDF.js wrapper). Scanned PDFs return empty/near-empty text from unpdf, triggering the Document AI fallback. This hybrid approach is free for most PDFs and only incurs cloud API cost ($1.50/1K pages) for scanned documents.

---

## Steps

### 1. Create PdfExtractor

Create `src/services/extractors/pdf.extractor.ts`:
- Supports: `application/pdf`
- Constructor takes optional `DocumentAiClient` and `Logger`
- `extract()`:
  1. Dynamic `import('unpdf')`, call `extractText(content)`
  2. If extracted text is < 50 chars and `documentAiClient` is provided, fall back to Document AI
  3. Return `ExtractionResult` with text, metadata (title, author from PDF properties), and page boundaries

### 2. Define DocumentAiClient Interface

Create a minimal interface for the Document AI client (the actual implementation depends on the consumer's GCP setup):

```typescript
export interface DocumentAiClient {
  extractText(content: Buffer): Promise<ExtractionResult>;
}
```

### 3. Register in Default Registry

Update `createDefaultRegistry()` to register `PdfExtractor` with optional `documentAiClient` from deps.

### 4. Add Peer Dependency

Add `unpdf` to `peerDependencies` and `peerDependenciesMeta` in `package.json`.

### 5. Write Unit Tests

- `pdf.extractor.spec.ts`:
  - Mock unpdf returning text — verify text returned, no Document AI call
  - Mock unpdf returning empty text — verify Document AI fallback called
  - Mock unpdf returning empty text, no Document AI client — verify empty result returned
  - Verify metadata extraction (title, author)

---

## Verification

- [ ] Digital PDFs extracted via unpdf (text-layer)
- [ ] Scanned PDFs fall back to Document AI when client provided
- [ ] Scanned PDFs return empty result gracefully when no Document AI client
- [ ] PDF metadata (title, author) included in ExtractionResult
- [ ] `unpdf` added as optional peer dependency
- [ ] All tests pass
- [ ] Build passes

---

**Related Design Docs**: [File Format Extraction](../../design/local.file-format-extraction.md)
