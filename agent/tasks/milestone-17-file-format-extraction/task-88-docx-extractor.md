# Task 88: DOCX Extractor

**Milestone**: [M17 - File Format Extraction](../../milestones/milestone-17-file-format-extraction.md)
**Estimated Time**: 2-3 hours
**Dependencies**: task-85
**Status**: Not Started

---

## Objective

Implement `DocxExtractor` that converts DOCX files to Markdown using mammoth (DOCX to HTML) and Turndown (HTML to Markdown), preserving headings, lists, and tables as structured Markdown.

---

## Context

mammoth is the only viable Node.js library for DOCX reading. It produces clean semantic HTML (ignoring visual formatting). Turndown converts that HTML to Markdown. Both are well-maintained (mammoth: 5K+ stars, Turndown: 9K+ stars). The pipeline preserves the content that matters for RAG: headings, paragraphs, lists, tables, links.

What won't be preserved: embedded charts, SmartArt, complex nested tables, custom fonts. This is acceptable for RAG use cases.

---

## Steps

### 1. Create DocxExtractor

Create `src/services/extractors/docx.extractor.ts`:
- Supports: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- `extract()`:
  1. Dynamic `import('mammoth')`, call `convertToHtml({ buffer: content })`
  2. Dynamic `import('turndown')`, convert HTML to Markdown
  3. Configure Turndown with `headingStyle: 'atx'` for `#` headings
  4. Return `ExtractionResult` with Markdown text

### 2. Register in Default Registry

Update `createDefaultRegistry()` to register `DocxExtractor`. Wrap in try/catch for missing peer deps.

### 3. Add Peer Dependencies

Add `mammoth` and `turndown` to `peerDependencies` and `peerDependenciesMeta` in `package.json`.

### 4. Write Unit Tests

- `docx.extractor.spec.ts`:
  - Mock mammoth returning HTML with headings, lists, tables
  - Verify Markdown output preserves structure
  - Verify tables converted to Markdown tables
  - Verify graceful error on corrupted DOCX

---

## Verification

- [ ] DOCX converted to Markdown with headings, lists preserved
- [ ] Tables converted to Markdown tables
- [ ] `mammoth` and `turndown` added as optional peer dependencies
- [ ] Graceful error on corrupted/invalid DOCX
- [ ] Registered in default registry with try/catch for missing deps
- [ ] All tests pass
- [ ] Build passes

---

**Related Design Docs**: [File Format Extraction](../../design/local.file-format-extraction.md)
