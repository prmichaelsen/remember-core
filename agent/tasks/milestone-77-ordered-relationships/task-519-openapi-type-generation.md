# Task 519: OpenAPI & Type Generation

**Milestone**: M77 — Ordered Relationships
**Status**: Completed
**Estimated Hours**: 2
**Dependencies**: [Task 516](task-516-schema-and-types.md)

---

## Objective

Update both OpenAPI specs to reflect the new reorder endpoint and ordered content response, then regenerate TypeScript types.

## Steps

1. **`docs/openapi.yaml`** (svc tier):
   - Add `POST /api/svc/v1/relationships/{id}/reorder` endpoint
   - Add `ReorderOperation` schema (discriminated union with `type` field)
   - Add `ReorderInput` schema (relationship_id, operation, version)
   - Add `member_order` field to Relationship response schema (object, additionalProperties: integer)
   - Add 409 Conflict response for version mismatch and set_order membership mismatch

2. **`docs/openapi-web.yaml`** (app tier):
   - Add `position` integer field to relationship memories response items
   - Update the `/api/app/v1/relationships/{id}/memories` response schema to include `OrderedContentItem` with position field
   - Document that items are returned in position order

3. **Regenerate types**:
   ```bash
   npm run generate:types
   ```

4. **Verify** generated types include the new schemas.

## Verification

- [ ] `docs/openapi.yaml` has reorder endpoint + ReorderOperation schema
- [ ] `docs/openapi-web.yaml` has position field on memory items
- [ ] `npm run generate:types` succeeds
- [ ] Generated type files include new schemas
- [ ] `npm run typecheck` passes
