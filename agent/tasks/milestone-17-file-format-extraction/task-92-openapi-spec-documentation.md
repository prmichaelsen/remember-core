# Task 92: OpenAPI Spec and Documentation

**Milestone**: [M17 - File Format Extraction](../../milestones/milestone-17-file-format-extraction.md)
**Estimated Time**: 2-3 hours
**Dependencies**: task-90
**Status**: Completed

---

## Objective

Update the OpenAPI spec with `file_url` and `mime_type` fields on `ImportItem`, add peer dependencies to `package.json`, regenerate SVC client types, and update the services barrel export.

---

## Steps

### 1. Update OpenAPI Spec

In `docs/openapi.yaml`, update the `ImportItem` schema:

```yaml
ImportItem:
  type: object
  properties:
    content:
      type: string
      description: Raw text content (mutually exclusive with file_url)
    file_url:
      type: string
      description: Signed HTTPS URL for file download (mutually exclusive with content)
    mime_type:
      type: string
      description: MIME type of the file (required when file_url is provided)
    source_filename:
      type: string
      description: Original filename for metadata
```

### 2. Add Peer Dependencies

Update `package.json`:

```json
{
  "peerDependencies": {
    "jsonwebtoken": "^9.0.0",
    "unpdf": "^0.12.0",
    "mammoth": "^1.8.0",
    "turndown": "^7.2.0"
  },
  "peerDependenciesMeta": {
    "jsonwebtoken": { "optional": true },
    "unpdf": { "optional": true },
    "mammoth": { "optional": true },
    "turndown": { "optional": true }
  }
}
```

Add `@types/turndown` to devDependencies if type declarations are needed.

### 3. Regenerate SVC Client Types

Run `npm run generate:types:svc` to regenerate types from the updated OpenAPI spec.

### 4. Update Barrel Exports

Add extractors to `src/services/index.ts` barrel export. Ensure `FileExtractor`, `ExtractionResult`, `ExtractorRegistry`, `createDefaultRegistry`, and all extractor classes are exported.

### 5. Update MIME Type Whitelist

Add `ALLOWED_MIME_TYPES` constant to extractors module for use by route handlers.

### 6. Verify Build

Run `npm run build` and `npm run typecheck` to ensure everything compiles.

---

## Verification

- [ ] OpenAPI spec includes `file_url` and `mime_type` on ImportItem
- [ ] Peer dependencies added to package.json
- [ ] SVC client types regenerated successfully
- [ ] Extractors exported from services barrel
- [ ] MIME type whitelist exported as constant
- [ ] `npm run build` passes
- [ ] `npm run typecheck` passes

---

**Related Design Docs**: [File Format Extraction](../../design/local.file-format-extraction.md)
