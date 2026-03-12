# Task 509: OpenAPI & REST Handlers

**Milestone**: M74 — Hierarchical Relationships
**Status**: pending
**Estimated Hours**: 3
**Dependencies**: T505, T506, T507, T508

---

## Objective

Update OpenAPI spec and document REST endpoint changes for hierarchy operations.

## Steps

1. Update `docs/openapi.yaml`:
   - Add `relationship_ids`, `parent_relationship_id`, `child_relationship_count` to Relationship schema
   - Add `relationship_ids` to create/update request bodies
   - Add `add_relationship_ids`, `remove_relationship_ids` to update request body
   - Add `GET /relationships/{id}/children` endpoint
   - Add `GET /relationships/{id}/flatten` endpoint (returns transitive memory IDs)

2. Regenerate types: `npm run generate:types:svc`

3. Update svc client if needed to expose new endpoints

4. Add integration notes for REST server (remember-rest-server) to implement handlers

## Verification

- [ ] OpenAPI spec validates (no schema errors)
- [ ] Generated types include new fields
- [ ] Existing relationship endpoints unchanged
- [ ] New endpoints documented with examples
