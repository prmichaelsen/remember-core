# Task 521: App Client Compounds

**Milestone**: M77 — Ordered Relationships
**Status**: Completed
**Estimated Hours**: 3
**Dependencies**: [Task 518](task-518-relationship-service-integration.md), [Task 519](task-519-openapi-type-generation.md), [Task 520](task-520-svc-client-reorder.md)

---

## Objective

Add `insertMemoryAt()` and `getOrderedContent()` compound operations to the App client's RelationshipsResource.

## Steps

### insertMemoryAt

1. **`src/app/relationships.ts`**: Add method:
   ```typescript
   insertMemoryAt(userId: string, input: {
     relationship_id: string;
     content: string;
     position: number;
     tags?: string[];
     context_summary?: string;
     version: number;
   }): Promise<SdkResponse<{ memory_id: string; relationship: RelationshipMetadata }>>
   ```

2. **Under the hood** (3 sequential svc REST calls):
   - `POST /api/svc/v1/memories` — create the memory
   - `PATCH /api/svc/v1/relationships/:id` — add_memory_ids with the new memory ID
   - `POST /api/svc/v1/relationships/:id/reorder` — move_to_index to the requested position

3. **Error handling**: If memory creation succeeds but add/reorder fails, return the error but include the created memory_id in the response context so the caller knows it exists.

### getOrderedContent

4. **`src/app/relationships.ts`**: Add method (or rename/enhance existing `getMemories`):
   ```typescript
   getOrderedContent(userId: string, relationshipId: string, options?: {
     limit?: number;
     offset?: number;
   }): Promise<SdkResponse<{
     relationship: RelationshipMetadata;
     items: Array<{ memory_id: string; position: number; content: string; tags: string[]; created_at: string }>;
     total: number;
     has_more: boolean;
   }>>
   ```

5. **Under the hood**: `GET /api/app/v1/relationships/:id/memories?limit=N&offset=M` — server returns items in position order with position field.

6. **Export** new types from `src/app/index.ts`.

### Tests

7. **`src/app/relationships.spec.ts`**:
   - `insertMemoryAt`: mock 3 HTTP calls, verify sequence and arguments
   - `insertMemoryAt`: verify error propagation from each step
   - `getOrderedContent`: mock HTTP call, verify params and response mapping
   - `getOrderedContent`: pagination (offset, limit, has_more)

## Verification

- [ ] `insertMemoryAt` creates memory, adds to relationship, reorders to position
- [ ] `insertMemoryAt` error handling returns memory_id on partial failure
- [ ] `getOrderedContent` returns position-sorted items with pagination
- [ ] Types exported from App client barrel
- [ ] All tests pass
- [ ] `npm run typecheck` passes
