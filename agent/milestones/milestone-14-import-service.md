# Milestone 14: Import Service

**Status**: not_started
**Estimated**: 1 week
**Dependencies**: None (all primitives exist: MemoryService, RelationshipService, HaikuClient)
**Design**: agent/design/local.import-service.md

---

## Goal

Add an ImportService to remember-core that handles bulk memory import: token-count chunking, batch memory creation, parent summary generation via HaikuClient, and relationship linking. Expose via REST endpoint and SVC client SDK.

## Deliverables

1. `ImportService` class with `import()` method and `chunkByTokens()` utility
2. OpenAPI spec for `POST /api/svc/v1/memories/import`
3. `svc.memories.import()` SDK method with generated types
4. Unit tests (colocated) and integration test
5. Barrel exports from `src/services/index.ts`

## Success Criteria

- [ ] `ImportService.import()` accepts 1+ items, returns ImportResult with parent + chunk memory IDs
- [ ] `chunkByTokens()` splits on paragraph boundaries within ~3K token budget
- [ ] Parent summary generated via `HaikuClient.extractFeatures()`
- [ ] `part_of` relationships link each chunk to parent
- [ ] Chunks tagged with `import:{uuid}` and `[CHUNK 00001]` markers
- [ ] OpenAPI spec defines request/response schemas
- [ ] SVC client `memories.import()` method uses generated types
- [ ] Unit tests pass for chunking edge cases, service orchestration
- [ ] All existing tests continue to pass

## Tasks

| ID | Name | Est. Hours | Dependencies |
|----|------|-----------|-------------|
| task-68 | ImportService + chunkByTokens + unit tests | 4-6 | None |
| task-69 | OpenAPI spec + SVC SDK import method | 2-3 | task-68 |
| task-70 | Barrel exports + integration test | 1-2 | task-68, task-69 |
