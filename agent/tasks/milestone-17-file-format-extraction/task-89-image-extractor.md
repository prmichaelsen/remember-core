# Task 89: Image Extractor

**Milestone**: [M17 - File Format Extraction](../../milestones/milestone-17-file-format-extraction.md)
**Estimated Time**: 2-3 hours
**Dependencies**: task-85
**Status**: Not Started

---

## Objective

Implement `ImageExtractor` that extracts text from images via Google Vision API OCR. This is the highest-priority extractor per user requirements.

---

## Context

Google Vision API is already set up in the GCP project. It provides 98% accuracy on printed text at $1.50/1K images (first 1K/month free). The extractor calls Vision API's text detection endpoint and returns the extracted text.

---

## Steps

### 1. Define VisionClient Interface

Create a minimal interface for the Vision API client:

```typescript
export interface VisionClient {
  detectText(content: Buffer): Promise<string>;
}
```

The actual implementation depends on the consumer's GCP setup (likely `@google-cloud/vision`).

### 2. Create ImageExtractor

Create `src/services/extractors/image.extractor.ts`:
- Supports: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/tiff`
- Constructor takes `VisionClient`
- `extract()`: calls `visionClient.detectText(content)`, returns `ExtractionResult` with extracted text

### 3. Register in Default Registry

Update `createDefaultRegistry()` to register `ImageExtractor` only when `visionClient` is provided in deps.

### 4. Write Unit Tests

- `image.extractor.spec.ts`:
  - Mock VisionClient returning text — verify text in result
  - Mock VisionClient returning empty string — verify empty result
  - Mock VisionClient throwing — verify error propagation
  - Verify all supported MIME types accepted

---

## Verification

- [ ] Images processed via Google Vision API OCR
- [ ] All image MIME types supported (PNG, JPEG, WebP, GIF, TIFF)
- [ ] Only registered when VisionClient provided
- [ ] Handles empty OCR results gracefully
- [ ] All tests pass
- [ ] Build passes

---

**Related Design Docs**: [File Format Extraction](../../design/local.file-format-extraction.md)
