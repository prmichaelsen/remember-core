# Task 70: Barrel Exports + Integration Test

**Status**: not_started
**Milestone**: M14 - Import Service
**Estimated Hours**: 1-2
**Dependencies**: task-68, task-69
**Design**: agent/design/local.import-service.md

---

## Objective

Export `ImportService` and its types from the services barrel (`src/services/index.ts`) and write an integration test that validates the full import flow against a real Weaviate instance.

## Steps

1. Update `src/services/index.ts`
   - Export `ImportService` class
   - Export all input/result types: `ImportItem`, `ImportInput`, `ImportItemResult`, `ImportResult`

2. Write integration test
   - Use test Weaviate instance (same pattern as existing integration tests)
   - Test: import a multi-paragraph text → verify N chunk memories created with correct properties
   - Test: verify parent summary memory exists with `import_summary` tag
   - Test: verify `part_of` relationships exist between chunks and parent
   - Test: verify `import:{uuid}` tags on all memories
   - Test: verify chunk ordering markers `[CHUNK 00001]`
   - Cleanup: delete created memories after test

3. Verify package exports
   - `import { ImportService } from '@prmichaelsen/remember-core/services'` works
   - Types are accessible to consumers

## Verification

- [ ] `ImportService` exported from `src/services/index.ts`
- [ ] All types exported
- [ ] Integration test creates real memories in Weaviate
- [ ] Integration test verifies relationships
- [ ] Integration test cleans up after itself
- [ ] `npm run build` succeeds
- [ ] All existing tests continue to pass
