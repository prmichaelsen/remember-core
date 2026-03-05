# Task 90: Import Pipeline Integration

**Milestone**: [M17 - File Format Extraction](../../milestones/milestone-17-file-format-extraction.md)
**Estimated Time**: 3-4 hours
**Dependencies**: task-85
**Status**: Completed

---

## Objective

Update `ImportItem` type to support file URLs, add extraction steps to `ImportJobWorker`, and add pre-import MIME type validation in the route handler.

---

## Context

Today `ImportItem` only accepts `content: string`. This task adds `file_url` and `mime_type` fields. When `file_url` is provided, the ImportJobWorker downloads the file via signed URL, extracts text via the ExtractorRegistry, and populates `content` before proceeding with the existing chunk-and-import flow. The REST handler validates MIME types before returning 202.

---

## Steps

### 1. Update ImportItem Type

In `src/services/import.service.ts`, update `ImportItem`:

```typescript
export interface ImportItem {
  content?: string;           // Raw text (existing)
  file_url?: string;          // Signed HTTPS URL (new)
  mime_type?: string;         // Required when file_url provided (new)
  source_filename?: string;   // Existing
}
```

One of `content` or `file_url` must be provided.

### 2. Add ExtractorRegistry to ImportJobWorker

Update `ImportJobWorker` constructor to accept `ExtractorRegistry`. Add extraction steps before the existing chunking flow:

1. If `item.file_url`: validate MIME type, download file via `downloadFile()`, extract text via registry
2. Populate `item.content` with extracted text
3. Proceed with existing chunk-and-import flow

### 3. Add Extraction Job Steps

Track extraction as steps in the job:
- `extraction-download`: Download file from signed URL
- `extraction-extract`: Extract text from file content

### 4. Add Pre-Import Validation

Before job creation (in the route handler layer), validate:
- `mime_type` required when `file_url` provided
- `mime_type` must be in registry's supported types
- Either `content` or `file_url` must be provided
- Return 400 with error details for validation failures

### 5. Write Unit Tests

- Mock ExtractorRegistry and downloadFile in ImportJobWorker tests
- Verify extraction steps tracked in job
- Verify extraction failure sets `extraction_failed` error code
- Verify validation rejects bad input with correct error messages

---

## Verification

- [ ] `ImportItem` accepts both `content` and `file_url` (backward compatible)
- [ ] `ImportJobWorker` downloads and extracts files before chunking
- [ ] Extraction tracked as job steps (download, extract)
- [ ] Extraction failure fails job with `extraction_failed` error code
- [ ] Pre-import validation rejects unsupported MIME types (400)
- [ ] Pre-import validation rejects missing `mime_type` when `file_url` provided (400)
- [ ] Pre-import validation rejects items with neither `content` nor `file_url` (400)
- [ ] Existing text-only imports still work (backward compatible)
- [ ] All tests pass
- [ ] Build passes

---

**Related Design Docs**: [File Format Extraction](../../design/local.file-format-extraction.md)
