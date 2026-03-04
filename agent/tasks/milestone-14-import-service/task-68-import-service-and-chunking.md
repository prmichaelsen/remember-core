# Task 68: ImportService + chunkByTokens + Unit Tests

**Status**: not_started
**Milestone**: M14 - Import Service
**Estimated Hours**: 4-6
**Dependencies**: None
**Design**: agent/design/local.import-service.md

---

## Objective

Implement the `ImportService` class and `chunkByTokens` utility function. The service accepts an array of import items (raw text content), chunks each by token count, creates memories via `MemoryService`, generates parent summaries via `HaikuClient.extractFeatures()`, and links chunks to parents via `RelationshipService`.

## Steps

1. Create `src/services/import.service.ts`
   - Define `ImportItem`, `ImportInput`, `ImportItemResult`, `ImportResult` types
   - Constructor: `(memoryService, relationshipService, haikuClient, logger)`
   - Implement `import(input: ImportInput): Promise<ImportResult>`

2. Implement `chunkByTokens(text, maxTokensPerChunk)` utility
   - Split on paragraph boundaries (`\n\n+`)
   - Accumulate paragraphs until token budget exceeded
   - Token estimation: `Math.ceil(text.length / 4)`
   - Handle edge cases: empty input, no paragraph breaks, single oversized paragraph
   - Default chunk size: 3000 tokens

3. Implement import flow per item:
   - Generate UUID `import_id`
   - Chunk content via `chunkByTokens`
   - Create chunk memories with `[CHUNK 00001]` markers and `import:{importId}` tags
   - Generate parent summary via `haikuClient.extractFeatures(sample)`
   - Create parent summary memory with `import_summary` tag
   - Create `part_of` relationships linking each chunk to parent
   - Return `ImportItemResult`

4. Create `src/services/import.service.spec.ts` (colocated unit tests)
   - Mock `MemoryService`, `RelationshipService`, `HaikuClient`
   - Test: single item, single chunk (no splitting needed)
   - Test: single item, multiple chunks
   - Test: multiple items
   - Test: correct tags, markers, relationship linking
   - Test: HaikuClient failure fallback (use default summary text)
   - Test `chunkByTokens` edge cases: empty, no paragraphs, oversized paragraph, Unicode

## Verification

- [ ] `ImportService` follows constructor DI pattern (like MemoryService, RelationshipService)
- [ ] `chunkByTokens` splits correctly on paragraph boundaries
- [ ] Token estimation is `Math.ceil(text.length / 4)`
- [ ] Chunk markers are `[CHUNK 00001]` format (5-digit zero-padded)
- [ ] Tags include `import:{uuid}` on all chunks and parent
- [ ] Parent has additional `import_summary` tag
- [ ] Relationships are `part_of` with source `rule`
- [ ] All unit tests pass
- [ ] No new external dependencies
