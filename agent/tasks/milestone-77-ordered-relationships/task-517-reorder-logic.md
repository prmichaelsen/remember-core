# Task 517: Reorder Logic

**Milestone**: M77 — Ordered Relationships
**Status**: Completed
**Estimated Hours**: 3
**Dependencies**: [Task 516](task-516-schema-and-types.md)

---

## Objective

Implement pure reorder operation handlers as an extracted module for testability. Each operation takes a current order map and returns a new order map.

## Steps

1. **Create** `src/services/relationship-reorder.ts` with:
   ```typescript
   export function applyReorder(
     currentOrder: Record<string, number>,
     memberIds: string[],
     operation: ReorderOperation,
   ): Record<string, number>
   ```

2. **Implement each operation**:
   - `move_to_index`: Move memory to target position, shift others to fill gap and make room
   - `swap`: Swap positions of two memories
   - `set_order`: Validate ordered_memory_ids matches current membership exactly (throw 409-style error if mismatch), then assign positions 0..N-1
   - `move_before`: Find target's position, insert memory immediately before it, shift others
   - `move_after`: Find target's position, insert memory immediately after it, shift others

3. **Helper functions**:
   - `parseMemberOrder(json: string | null | undefined): Record<string, number>` — parse JSON, return empty map for null/undefined
   - `serializeMemberOrder(order: Record<string, number>): string` — JSON.stringify
   - `buildDefaultOrder(memberIds: string[]): Record<string, number>` — assign positions 0..N-1 from array order
   - `compactOrder(order: Record<string, number>): Record<string, number>` — remove gaps, re-index 0..N-1
   - `sortMemberIdsByOrder(memberIds: string[], order: Record<string, number>): string[]` — return IDs sorted by position

4. **Create** `src/services/relationship-reorder.spec.ts` with tests for:
   - Each operation type (happy path)
   - Edge cases: move to same position, swap with self, set_order with mismatched IDs
   - compactOrder with gaps
   - buildDefaultOrder
   - sortMemberIdsByOrder

## Verification

- [ ] All 5 reorder operations produce correct output
- [ ] set_order throws on membership mismatch (missing/extra IDs)
- [ ] compactOrder produces dense 0..N-1 positions
- [ ] All tests pass
