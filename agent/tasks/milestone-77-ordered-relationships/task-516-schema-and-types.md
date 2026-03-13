# Task 516: Schema & Types

**Milestone**: M77 — Ordered Relationships
**Status**: Completed
**Estimated Hours**: 2
**Dependencies**: None

---

## Objective

Add `member_order_json` to the Weaviate relationship schema and define the TypeScript types for member ordering and reorder operations.

## Steps

1. **Weaviate schema** (`src/database/weaviate/v2-collections.ts`): Add `member_order_json` property to relationship document properties:
   ```typescript
   { name: 'member_order_json', dataType: 'TEXT' as const, indexFilterable: false, indexSearchable: false }
   ```

2. **Relationship type** (`src/types/memory.types.ts`): Add `member_order?: Record<string, number>` to the Relationship interface. This is the parsed form — the raw `member_order_json` string stays internal to the database layer.

3. **ReorderOperation type** (`src/types/memory.types.ts` or new file if types are large):
   ```typescript
   export type ReorderOperation =
     | { type: 'move_to_index'; memory_id: string; index: number }
     | { type: 'swap'; memory_id_a: string; memory_id_b: string }
     | { type: 'set_order'; ordered_memory_ids: string[] }
     | { type: 'move_before'; memory_id: string; before: string }
     | { type: 'move_after'; memory_id: string; after: string };

   export interface ReorderInput {
     relationship_id: string;
     operation: ReorderOperation;
     version: number;
   }
   ```

4. **Export** new types from barrel files.

## Verification

- [ ] `npm run typecheck` passes
- [ ] `member_order_json` appears in v2-collections schema
- [ ] ReorderOperation union is exported and usable
- [ ] Existing tests still pass (no regressions from schema addition)
