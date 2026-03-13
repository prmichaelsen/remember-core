# Task 520: Svc Client Reorder

**Milestone**: M77 — Ordered Relationships
**Status**: Not Started
**Estimated Hours**: 1
**Dependencies**: [Task 519](task-519-openapi-type-generation.md)

---

## Objective

Add `reorder()` method to the svc client's RelationshipsResource, mirroring the REST endpoint 1:1.

## Steps

1. **`src/clients/svc/v1/relationships.ts`**: Add `reorder` method:
   ```typescript
   reorder(userId: string, relationshipId: string, input: {
     operation: ReorderOperation;
     version: number;
   }): Promise<SdkResponse<Relationship>>
   ```
   Maps to `POST /api/svc/v1/relationships/${relationshipId}/reorder`.

2. **Export** ReorderOperation type from the svc client barrel.

3. **Tests** in `src/clients/svc/v1/relationships.spec.ts`:
   - Calls correct HTTP method and path
   - Sends operation + version in body
   - Returns updated relationship on success

## Verification

- [ ] `client.relationships.reorder()` exists and is typed
- [ ] Calls POST /api/svc/v1/relationships/:id/reorder
- [ ] Tests pass
- [ ] `npm run typecheck` passes
