# Task 86: Plaintext and HTML Extractors

**Milestone**: [M17 - File Format Extraction](../../milestones/milestone-17-file-format-extraction.md)
**Estimated Time**: 1-2 hours
**Dependencies**: task-85
**Status**: Completed

---

## Objective

Implement `PlaintextExtractor` (UTF-8 passthrough for TXT, Markdown, CSV, JSON, YAML) and `HtmlExtractor` (HTML to Markdown via Turndown). Register both in the default registry.

---

## Context

These are the simplest extractors and establish the pattern for more complex ones. Plaintext is a passthrough (no transformation). HTML uses Turndown to convert to Markdown, which is already needed for the DOCX pipeline (task-88), so this also validates the Turndown peer dependency setup.

---

## Steps

### 1. Create PlaintextExtractor

Create `src/services/extractors/plaintext.extractor.ts`:
- Supports: `text/plain`, `text/markdown`, `text/csv`, `application/json`, `application/x-yaml`, `text/yaml`
- `extract()`: returns `content.toString('utf-8')` with empty metadata

### 2. Create HtmlExtractor

Create `src/services/extractors/html.extractor.ts`:
- Supports: `text/html`
- `extract()`: uses dynamic `import('turndown')` to convert HTML to Markdown
- Configure Turndown with `headingStyle: 'atx'`

### 3. Register in Default Registry

Update `createDefaultRegistry()` in `registry.ts` to register both extractors.

### 4. Write Unit Tests

- `plaintext.extractor.spec.ts` — UTF-8 text returned as-is, handles various MIME types
- `html.extractor.spec.ts` — HTML converted to Markdown (headings, links, tables, lists)

---

## Verification

- [ ] `PlaintextExtractor` returns raw text for all supported MIME types
- [ ] `HtmlExtractor` converts HTML to Markdown with headings preserved
- [ ] Both registered in default registry
- [ ] Turndown imported dynamically (peer dependency)
- [ ] All tests pass
- [ ] Build passes

---

**Related Design Docs**: [File Format Extraction](../../design/local.file-format-extraction.md)
