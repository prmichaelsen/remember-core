# Task 39: Build Svc Client — Memories + Relationships Resources

**Milestone**: M9 — Client SDKs
**Status**: Not Started
**Estimated Hours**: 4
**Dependencies**: Task 38

---

## Objective

Create the memories and relationships resource modules for the svc client, mapping 1:1 to `/api/svc/v1/` REST routes.

## Steps

1. Create `src/clients/svc/v1/memories.ts`:
   - `create(userId, input)` → POST `/api/svc/v1/memories`
   - `update(userId, id, input)` → PATCH `/api/svc/v1/memories/:id`
   - `delete(userId, id, input?)` → DELETE `/api/svc/v1/memories/:id`
   - `search(userId, input)` → POST `/api/svc/v1/memories/search`
   - `similar(userId, input)` → POST `/api/svc/v1/memories/similar`
   - `query(userId, input)` → POST `/api/svc/v1/memories/query`
   - All return `SdkResponse<T>` with generated types from Task 37

2. Create `src/clients/svc/v1/relationships.ts`:
   - `create(userId, input)` → POST `/api/svc/v1/relationships`
   - `update(userId, id, input)` → PATCH `/api/svc/v1/relationships/:id`
   - `delete(userId, id)` → DELETE `/api/svc/v1/relationships/:id`
   - `search(userId, input)` → POST `/api/svc/v1/relationships/search`

3. Write colocated test: `src/clients/svc/v1/memories.spec.ts`

## Verification

- [ ] All 6 memory methods map to correct HTTP method + URL
- [ ] All 4 relationship methods map to correct HTTP method + URL
- [ ] Request bodies match OpenAPI spec shapes
- [ ] Response types use generated types
- [ ] Tests pass with mocked fetch
