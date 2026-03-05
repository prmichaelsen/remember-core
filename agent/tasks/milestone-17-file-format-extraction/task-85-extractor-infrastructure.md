# Task 85: Extractor Infrastructure

**Milestone**: [M17 - File Format Extraction](../../milestones/milestone-17-file-format-extraction.md)
**Estimated Time**: 2-3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create the foundational types, interfaces, and utilities for the file extraction system: `FileExtractor` interface, `ExtractionResult` type, `ExtractorRegistry`, `downloadFile()` utility, and barrel exports.

---

## Context

All format-specific extractors (PDF, DOCX, image, etc.) depend on a shared interface and registry pattern. The download utility uses plain `fetch()` with signed HTTPS URLs so remember-core stays storage-agnostic. This task creates the infrastructure that all subsequent extractor tasks build on.

---

## Steps

### 1. Create Extractor Types

Create `src/services/extractors/types.ts` with:

```typescript
export interface ExtractionResult {
  text: string;
  metadata: Record<string, string>;
  page_boundaries?: number[];
}

export interface FileExtractor {
  readonly supportedMimeTypes: string[];
  extract(content: Buffer, mimeType: string): Promise<ExtractionResult>;
}
```

### 2. Create ExtractorRegistry

Create `src/services/extractors/registry.ts` with:
- `ExtractorRegistry` class with `register()`, `getExtractor()`, `getSupportedMimeTypes()`
- `createDefaultRegistry()` factory function (initially empty — extractors added in later tasks)

### 3. Create Download Utility

Create `src/services/extractors/download.ts` with:
- `downloadFile(fileUrl: string): Promise<Buffer>` — plain `fetch()`, returns Buffer
- Error handling for non-200 responses, network failures

### 4. Create Barrel Exports

Create `src/services/extractors/index.ts` re-exporting types, registry, and download utility.

### 5. Write Unit Tests

- `registry.spec.ts` — register extractor, lookup by MIME type, unsupported returns null, getSupportedMimeTypes
- `download.spec.ts` — mock fetch, verify Buffer returned, error on non-200, error on network failure

---

## Verification

- [ ] `FileExtractor` interface and `ExtractionResult` type exported
- [ ] `ExtractorRegistry` registers and looks up extractors by MIME type
- [ ] `getSupportedMimeTypes()` returns union of all registered MIME types
- [ ] `downloadFile()` fetches URL and returns Buffer
- [ ] `downloadFile()` throws on non-200 response
- [ ] Barrel exports work from `src/services/extractors/index.ts`
- [ ] All tests pass
- [ ] Build passes, no type errors

---

**Related Design Docs**: [File Format Extraction](../../design/local.file-format-extraction.md)
