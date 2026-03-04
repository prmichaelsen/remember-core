# Task 69: OpenAPI Spec + SVC SDK Import Method

**Status**: not_started
**Milestone**: M14 - Import Service
**Estimated Hours**: 2-3
**Dependencies**: task-68
**Design**: agent/design/local.import-service.md

---

## Objective

Define the import endpoint in the OpenAPI spec (`docs/openapi.yaml`) and add the `import()` method to the SVC client SDK's `MemoriesResource`. Types should be generated from the spec via `openapi-typescript`.

## Steps

1. Add import endpoint to `docs/openapi.yaml`
   - Path: `POST /api/svc/v1/memories/import`
   - Define `ImportInput` schema in `components/schemas`
   - Define `ImportResult` schema in `components/schemas`
   - Define `ImportItem`, `ImportItemResult` sub-schemas
   - Include proper descriptions and examples

2. Generate types from OpenAPI spec
   - Run `openapi-typescript` to regenerate types
   - Verify generated types match service Input/Result types

3. Add `import()` method to `src/clients/svc/v1/memories.ts`
   - Add to `MemoriesResource` interface
   - Implementation: `http.request('POST', '/api/svc/v1/memories/import', { userId, body: input })`
   - Use generated types from OpenAPI spec

4. Update method count in existing client tests (if asserting method count)

## Verification

- [ ] OpenAPI spec has `POST /api/svc/v1/memories/import` with full schema
- [ ] `openapi-typescript` generates types without errors
- [ ] `svc.memories.import(userId, input)` compiles and calls correct endpoint
- [ ] Existing client tests still pass
- [ ] Method count assertion updated (if applicable)
