# Task 91: Metadata and Enhanced Chunking

**Milestone**: [M17 - File Format Extraction](../../milestones/milestone-17-file-format-extraction.md)
**Estimated Time**: 2-3 hours
**Dependencies**: task-90
**Status**: Not Started

---

## Objective

Add document metadata tagging, page-number chunk markers, `source:file_import` tagging, and best-effort section-aware chunking to the import pipeline.

---

## Context

When files are extracted, we gain metadata (PDF title/author, page boundaries) and structural information (Markdown headings from DOCX/HTML). This task uses that information to improve chunk quality and traceability.

---

## Steps

### 1. Add source:file_import Tag

All memories created from file imports get `source:file_import` tag. This lets downstream LLM consumers apply different trust levels for prompt injection awareness.

### 2. Add Document Metadata Tags

When `ExtractionResult.metadata` contains values, add them as tags on the parent summary memory:
- `doc:title:{title}`
- `doc:author:{author}`
- `doc:created:{date}`
- `doc:pages:{pageCount}`

### 3. Add Page Numbers to Chunk Markers

When `ExtractionResult.page_boundaries` is available, calculate which pages each chunk spans and include in the marker:
- `[CHUNK 00003 | Pages 5-7]` instead of `[CHUNK 00003]`

### 4. Implement Section-Aware Chunking (Best-Effort)

Enhance `chunkByTokens()` to prefer splitting on Markdown heading boundaries when available:
- Split on heading lines (`# `, `## `, `### `) as preferred split points
- Within sections, fall back to paragraph splitting as today
- If a single section exceeds the token budget, fall back to paragraph splitting within that section
- This is opt-in (only when extracted text contains headings)

### 5. Write Unit Tests

- Verify `source:file_import` tag added to all file-imported memories
- Verify metadata tags on parent summary
- Verify page numbers in chunk markers
- Verify section-aware chunking splits on headings
- Verify section-aware chunking falls back to paragraph splitting for oversized sections

---

## Verification

- [ ] All file-imported memories tagged with `source:file_import`
- [ ] Document metadata stored as tags on parent summary
- [ ] Page numbers included in chunk markers when page boundaries available
- [ ] Section-aware chunking splits on headings when available
- [ ] Falls back to paragraph splitting when sections exceed budget
- [ ] Existing text-only imports unaffected (no headings = no change)
- [ ] All tests pass
- [ ] Build passes

---

**Related Design Docs**: [File Format Extraction](../../design/local.file-format-extraction.md)
