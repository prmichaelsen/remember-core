# Milestone 17: File Format Extraction

**Goal**: Add pluggable file-to-text extraction to the import pipeline, supporting PDF, DOCX, images (OCR), HTML, and structured data
**Duration**: 2-3 weeks
**Dependencies**: M14 (Import Service), M16 (Job Tracking System)
**Status**: Not Started

---

## Overview

The import pipeline today accepts only raw text strings. This milestone adds a pluggable extraction layer to remember-core that converts files in various formats to text before feeding them into the existing chunking and memory creation pipeline. Consumers upload files to cloud storage, generate a signed HTTPS URL, and pass it to the import endpoint. The ImportJobWorker downloads the file, extracts text via format-specific extractors, then proceeds with the existing chunk-and-import flow.

This enables users to attach PDFs, Word documents, images, and other files in chat and have them imported as searchable memories.

---

## Deliverables

### 1. Extractor Infrastructure
- `FileExtractor` interface and `ExtractionResult` type
- `ExtractorRegistry` with MIME type lookup and factory function
- `downloadFile()` utility using plain `fetch()` with signed URLs
- Barrel exports from `src/services/extractors/index.ts`

### 2. Format Extractors
- `PlaintextExtractor` — TXT, Markdown, CSV, JSON, YAML passthrough
- `HtmlExtractor` — HTML to Markdown via Turndown
- `PdfExtractor` — text-layer via unpdf, scanned fallback via Google Document AI
- `DocxExtractor` — DOCX to Markdown via mammoth + Turndown
- `ImageExtractor` — OCR via Google Vision API

### 3. Import Pipeline Integration
- Updated `ImportItem` type with `file_url` and `mime_type` fields
- Extraction steps in `ImportJobWorker` (download, extract, then chunk)
- Pre-import MIME type validation (400 before 202)
- `source:file_import` metadata tagging for prompt injection awareness

### 4. Enhanced Chunking
- Page-number chunk markers (`[CHUNK 00003 | Pages 5-7]`)
- Document metadata as tags on parent summary
- Best-effort section-aware chunking (split on headings when available)

### 5. Package Updates
- Optional peer dependencies: `unpdf`, `mammoth`, `turndown`
- Updated OpenAPI spec with `file_url`/`mime_type` fields
- Regenerated SVC client types

---

## Success Criteria

- [ ] `PlaintextExtractor` handles TXT, Markdown, CSV, JSON, YAML
- [ ] `HtmlExtractor` converts HTML to Markdown
- [ ] `PdfExtractor` extracts text from digital PDFs via unpdf
- [ ] `PdfExtractor` falls back to Document AI for scanned PDFs
- [ ] `DocxExtractor` converts DOCX to Markdown with tables preserved
- [ ] `ImageExtractor` extracts text via Google Vision API
- [ ] `ImportJobWorker` downloads files via signed URL and extracts text
- [ ] Pre-import validation rejects unsupported MIME types with 400
- [ ] Imported memories are tagged with `source:file_import`
- [ ] Document metadata (title, author) stored as tags
- [ ] Page numbers included in chunk markers when available
- [ ] All extractors have colocated unit tests
- [ ] Build passes, no type errors
- [ ] OpenAPI spec updated, SVC client types regenerated

---

## Key Files to Create

```
src/services/extractors/
  types.ts
  registry.ts
  download.ts
  plaintext.extractor.ts
  plaintext.extractor.spec.ts
  html.extractor.ts
  html.extractor.spec.ts
  pdf.extractor.ts
  pdf.extractor.spec.ts
  docx.extractor.ts
  docx.extractor.spec.ts
  image.extractor.ts
  image.extractor.spec.ts
  index.ts
```

---

## Tasks

1. [Task 85: Extractor infrastructure](../tasks/milestone-17-file-format-extraction/task-85-extractor-infrastructure.md) - Types, interface, registry, download utility
2. [Task 86: Plaintext and HTML extractors](../tasks/milestone-17-file-format-extraction/task-86-plaintext-html-extractors.md) - Passthrough + Turndown
3. [Task 87: PDF extractor](../tasks/milestone-17-file-format-extraction/task-87-pdf-extractor.md) - unpdf + Document AI fallback
4. [Task 88: DOCX extractor](../tasks/milestone-17-file-format-extraction/task-88-docx-extractor.md) - mammoth + Turndown
5. [Task 89: Image extractor](../tasks/milestone-17-file-format-extraction/task-89-image-extractor.md) - Google Vision API OCR
6. [Task 90: Import pipeline integration](../tasks/milestone-17-file-format-extraction/task-90-import-pipeline-integration.md) - ImportItem update, worker steps, validation
7. [Task 91: Metadata and enhanced chunking](../tasks/milestone-17-file-format-extraction/task-91-metadata-enhanced-chunking.md) - Tags, page markers, section-aware splitting
8. [Task 92: OpenAPI spec and documentation](../tasks/milestone-17-file-format-extraction/task-92-openapi-spec-documentation.md) - Spec, types, peer deps, docs

---

## Testing Requirements

- [ ] Unit tests for each extractor (colocated `.spec.ts`)
- [ ] Unit tests for ExtractorRegistry (lookup, unsupported type)
- [ ] Unit tests for downloadFile (mock fetch, error cases)
- [ ] Unit tests for ImportJobWorker extraction steps
- [ ] Unit tests for pre-import validation
- [ ] Unit tests for section-aware chunking

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| unpdf doesn't handle all PDF variants | Medium | Low | Document AI fallback covers edge cases |
| mammoth loses complex DOCX formatting | Medium | Medium | Acceptable for RAG — only semantic content matters |
| Signed URL expiry before job processes | High | Low | Recommend 1-hour TTL, clear `download_expired` error |
| Peer dependency confusion for consumers | Medium | Medium | Clear error messages, documentation |
| Google Document AI processor not provisioned | High | Medium | Task 87 includes setup instructions |

---

**Next Milestone**: TBD
**Blockers**: None (M14 and M16 are complete)
**Notes**: Priority order is Image OCR > PDF > DOCX per user requirements
**Design Doc**: [agent/design/local.file-format-extraction.md](../design/local.file-format-extraction.md)
