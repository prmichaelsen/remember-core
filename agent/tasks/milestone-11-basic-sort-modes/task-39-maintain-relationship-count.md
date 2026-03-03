# Task 39: Update RelationshipService to Maintain relationship_count

**Milestone**: [M11 - Basic Sort Modes](../../milestones/milestone-11-basic-sort-modes.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 37 (relationship_count property must exist)
**Status**: Not Started

---

## Objective

Modify `RelationshipService.create()` and `delete()` methods to automatically update `relationship_count` for all connected memories whenever relationships are created or deleted. This keeps the denormalized property in sync with the source of truth.

---

## Context

Once relationship_count is backfilled (Task 38), we need to maintain it going forward. RelationshipService is responsible for relationship CRUD, so it's the natural place to increment/decrement counts.

When a relationship is created between memories A, B, and C:
- A.relationship_count += 1
- B.relationship_count += 1
- C.relationship_count += 1

When that relationship is deleted:
- A.relationship_count -= 1 (floor at 0)
- B.relationship_count -= 1 (floor at 0)
- C.relationship_count -= 1 (floor at 0)

---

## Steps

### 1. Add Helper Method to RelationshipService

Add a private method to update counts:

```typescript
/**
 * Update relationship_count for a memory by a delta (+1 or -1).
 * Ensures count never goes negative.
 */
private async updateRelationshipCount(
  memoryId: string,
  delta: number
): Promise<void> {
  try {
    const memory = await this.collection.query.fetchObjectById(memoryId, {
      returnProperties: ['relationship_count'],
    });

    if (!memory) {
      this.logger.warn?.(`Memory ${memoryId} not found, skipping relationship_count update`);
      return;
    }

    const currentCount = (memory.properties.relationship_count as number) || 0;
    const newCount = Math.max(0, currentCount + delta); // Floor at 0

    await this.collection.data.update({
      id: memoryId,
      properties: {
        relationship_count: newCount,
      },
    });

    this.logger.debug?.(`Updated relationship_count for ${memoryId}: ${currentCount} -> ${newCount}`);
  } catch (error) {
    this.logger.error?.(`Failed to update relationship_count for ${memoryId}:`, error);
    // Don't throw - this is a denormalized field, not critical for relationship creation
  }
}
```

### 2. Update create() Method

In `RelationshipService.create()`, after successfully creating the relationship (around line 180):

```typescript
async create(input: CreateRelationshipInput): Promise<CreateRelationshipResult> {
  // ... existing validation and creation logic ...

  const uuid = await this.collection.data.insert(properties);
  const relationshipId = uuid.toString();

  // Update relationship_count for all memories (NEW)
  await Promise.all(
    input.memory_ids.map(memoryId =>
      this.updateRelationshipCount(memoryId, +1)
    )
  );

  // Update memories' relationship_ids arrays
  await this.updateMemoriesRelationshipIds(input.memory_ids, relationshipId, 'add');

  this.logger.info?.('Relationship created', {
    relationship_id: relationshipId,
    memory_ids: input.memory_ids,
    type: input.relationship_type,
  });

  return {
    relationship_id: relationshipId,
    memory_ids: input.memory_ids,
    created_at: now,
  };
}
```

### 3. Update delete() Method

In `RelationshipService.delete()`, after successfully deleting the relationship:

```typescript
async delete(input: DeleteRelationshipInput): Promise<DeleteRelationshipResult> {
  // ... existing validation and deletion logic ...

  const relationship = await this.collection.query.fetchObjectById(input.relationship_id, {
    returnProperties: ['user_id', 'doc_type', 'related_memory_ids'],
  });

  if (!relationship) {
    throw new Error(`Relationship not found: ${input.relationship_id}`);
  }

  const memoryIds = relationship.properties.related_memory_ids as string[];

  // Soft delete the relationship
  await this.collection.data.update({
    id: input.relationship_id,
    properties: {
      deleted_at: new Date().toISOString(),
    },
  });

  // Update relationship_count for all memories (NEW)
  await Promise.all(
    memoryIds.map(memoryId =>
      this.updateRelationshipCount(memoryId, -1)
    )
  );

  // Remove from memories' relationship_ids arrays
  await this.updateMemoriesRelationshipIds(memoryIds, input.relationship_id, 'remove');

  this.logger.info?.('Relationship deleted', {
    relationship_id: input.relationship_id,
    memory_ids: memoryIds,
  });

  return {
    relationship_id: input.relationship_id,
    memories_updated: memoryIds.length,
  };
}
```

### 4. Add Tests

Update `src/services/relationship.service.spec.ts`:

```typescript
describe('RelationshipService - relationship_count maintenance', () => {
  it('should increment relationship_count when creating relationship', async () => {
    const memory1 = await createTestMemory({ relationship_count: 0 });
    const memory2 = await createTestMemory({ relationship_count: 0 });

    await relationshipService.create({
      memory_ids: [memory1.id, memory2.id],
      relationship_type: 'related',
      observation: 'Test relationship',
    });

    const updated1 = await getMemory(memory1.id);
    const updated2 = await getMemory(memory2.id);

    expect(updated1.relationship_count).toBe(1);
    expect(updated2.relationship_count).toBe(1);
  });

  it('should decrement relationship_count when deleting relationship', async () => {
    const memory1 = await createTestMemory({ relationship_count: 2 });
    const memory2 = await createTestMemory({ relationship_count: 3 });

    const { relationship_id } = await relationshipService.create({
      memory_ids: [memory1.id, memory2.id],
      relationship_type: 'related',
      observation: 'Test',
    });

    await relationshipService.delete({ relationship_id });

    const updated1 = await getMemory(memory1.id);
    const updated2 = await getMemory(memory2.id);

    expect(updated1.relationship_count).toBe(2); // Back to original
    expect(updated2.relationship_count).toBe(3); // Back to original
  });

  it('should never go negative', async () => {
    const memory = await createTestMemory({ relationship_count: 0 });

    const { relationship_id } = await relationshipService.create({
      memory_ids: [memory.id, otherMemory.id],
      relationship_type: 'related',
      observation: 'Test',
    });

    await relationshipService.delete({ relationship_id });

    const updated = await getMemory(memory.id);
    expect(updated.relationship_count).toBe(0); // Floor at 0, not negative
  });
});
```

---

## Verification

- [ ] `updateRelationshipCount()` helper method added
- [ ] `create()` increments count for all memory_ids
- [ ] `delete()` decrements count for all memory_ids
- [ ] Counts never go negative (floor at 0)
- [ ] Updates happen in parallel (Promise.all)
- [ ] Errors don't crash relationship create/delete (just logged)
- [ ] Unit tests pass
- [ ] Integration tests verify counts stay in sync

---

## Expected Output

**Creating Relationship**:
```typescript
// Before: memory1.relationship_count = 2, memory2.relationship_count = 5
await relationshipService.create({
  memory_ids: [memory1.id, memory2.id],
  relationship_type: 'causes',
  observation: 'A causes B',
});
// After: memory1.relationship_count = 3, memory2.relationship_count = 6
```

**Deleting Relationship**:
```typescript
// Before: memory1.relationship_count = 3, memory2.relationship_count = 6
await relationshipService.delete({ relationship_id: 'abc123' });
// After: memory1.relationship_count = 2, memory2.relationship_count = 5
```

---

## Common Issues and Solutions

### Issue 1: Counts get out of sync
**Symptom**: relationship_count doesn't match relationships.length
**Solution**: Re-run backfill script (Task 38) to reset all counts. Add logging to track updates.

### Issue 2: Relationship creation fails due to count update error
**Symptom**: Relationship not created when count update fails
**Solution**: Wrap count update in try-catch (already implemented). Count is denormalized, shouldn't block main operation.

### Issue 3: Performance impact on relationship create/delete
**Symptom**: Slower relationship operations
**Solution**: Count updates are already parallel (Promise.all). For many-to-many relationships (10+ memories), consider batching.

---

## Notes

- Count updates are best-effort (logged but don't block operations)
- Counts can be verified/repaired with backfill script
- This is denormalized data - source of truth remains `relationships` array
- Performance impact minimal (single property update per memory)

---

**Next Task**: [task-40-add-bydensity-sort-mode.md](task-40-add-bydensity-sort-mode.md)
**Related Design Docs**: [memory-sorting-algorithms.md](../../design/memory-sorting-algorithms.md)
