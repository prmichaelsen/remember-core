# Task 57: Add Enhanced Logging to RemService

**Milestone**: Unassigned (Enhancement)
**Estimated Time**: 2-3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add comprehensive logging to RemService to improve observability and debugging of the REM cursor advancement and collection selection logic.

---

## Context

The current RemService implementation logs only the selected collection ID but not the cursor position or whether the cursor advanced. When debugging cursor advancement issues (e.g., "why is it processing the same collection?"), operators need to see:

1. The cursor state before collection selection
2. Which collection was selected
3. Whether it's the same collection as last run (wrap-around)
4. Memory selection and clustering progress
5. Haiku validation results

This task adds structured logging at key decision points to make REM cycles fully observable.

**Related Issue**: remember-rem deployment showed cursor not advancing — turned out to be expected wrap-around with single collection, but logs didn't make this clear.

---

## Steps

### 1. Add Cursor Loading Logs

Add logging immediately after loading the cursor in `RemService.runCycle()`:

**Location**: `src/services/rem.service.ts`, line ~72

```typescript
const cursor = await this.deps.stateStore.getCursor();
this.logger.info?.('REM cursor loaded', {
  last_collection_id: cursor?.last_collection_id ?? '(none)',
  last_run_at: cursor?.last_run_at ?? '(never)',
});
```

**Expected Output**:
```
REM cursor loaded: { last_collection_id: "Memory_users_alice", last_run_at: "2026-03-03T05:00:00Z" }
```

### 2. Add No Collections Log

Add logging when no collections are available:

**Location**: `src/services/rem.service.ts`, line ~74

```typescript
if (!collectionId) {
  this.logger.info?.('No collections to process');
  stats.duration_ms = Date.now() - start;
  return stats;
}
```

**Expected Output**:
```
No collections to process
```

### 3. Enhance Collection Selection Logs

Replace the basic "REM cycle starting" log with more detailed information:

**Location**: `src/services/rem.service.ts`, line ~79

```typescript
this.logger.info?.('REM cycle starting', {
  collectionId,
  advanced_from: cursor?.last_collection_id ?? '(first run)',
  is_same_collection: cursor?.last_collection_id === collectionId,
  wrap_around: cursor?.last_collection_id && cursor.last_collection_id >= collectionId,
});
```

**Expected Output**:
```
REM cycle starting: {
  collectionId: "Memory_users_alice",
  advanced_from: "Memory_users_alice",
  is_same_collection: true,
  wrap_around: true
}
```

### 4. Add Memory Selection Logs

Add logging after candidate selection:

**Location**: `src/services/rem.service.ts`, line ~107

```typescript
const candidates = await selectCandidates(
  collection,
  memoryCursor,
  this.config.max_candidates_per_run,
);
stats.memories_scanned = candidates.length;

this.logger.debug?.('Memory candidates selected', {
  count: candidates.length,
  memory_cursor: memoryCursor || '(none)',
});
```

**Expected Output**:
```
Memory candidates selected: { count: 15, memory_cursor: "2026-03-01T..." }
```

### 5. Add Clustering Progress Logs

Add logging after cluster formation:

**Location**: `src/services/rem.service.ts`, line ~117

```typescript
const clusters = await formClusters(collection, candidates, this.config);
stats.clusters_found = clusters.length;

this.logger.info?.('Clusters formed', {
  clusters_found: clusters.length,
  avg_cluster_size: clusters.length > 0
    ? Math.round(clusters.reduce((sum, c) => sum + c.memory_ids.length, 0) / clusters.length)
    : 0,
});
```

**Expected Output**:
```
Clusters formed: { clusters_found: 3, avg_cluster_size: 4 }
```

### 6. Add Haiku Validation Logs

Add logging for Haiku validation results:

**Location**: `src/services/rem.service.ts`, line ~138 (in action loop)

```typescript
const validated = await this.validateWithHaiku(action.cluster);
if (!validated) {
  this.logger.debug?.('Cluster rejected by Haiku', {
    cluster_size: action.cluster.memory_ids.length,
  });
  stats.skipped_by_haiku++;
  continue;
}

this.logger.debug?.('Cluster validated by Haiku', {
  cluster_size: action.cluster.memory_ids.length,
  relationship_type: validated.relationship_type,
  observation: validated.observation,
});
```

**Expected Output**:
```
Cluster rejected by Haiku: { cluster_size: 2 }
Cluster validated by Haiku: {
  cluster_size: 4,
  relationship_type: "topical",
  observation: "Memories about TypeScript development"
}
```

### 7. Add Cursor Advancement Logs

Add logging when saving the new cursor:

**Location**: `src/services/rem.service.ts`, line ~223 (in `advanceCursor` method)

```typescript
private async advanceCursor(collectionId: string, memoryCursor: string) {
  const now = new Date().toISOString();
  await this.deps.stateStore.saveCursor({
    last_collection_id: collectionId,
    last_run_at: now,
  });
  await this.deps.stateStore.saveCollectionState({
    collection_id: collectionId,
    last_processed_at: now,
    memory_cursor: memoryCursor,
  });
  this.logger.debug?.('Cursor advanced', {
    collection_id: collectionId,
    memory_cursor: memoryCursor || '(reset)',
  });
}
```

**Expected Output**:
```
Cursor advanced: {
  collection_id: "Memory_users_alice",
  memory_cursor: "2026-03-03T05:15:00Z"
}
```

### 8. Update Cycle Complete Log

Enhance the final log with more context:

**Location**: `src/services/rem.service.ts`, line ~201

```typescript
this.logger.info?.('REM cycle complete', {
  ...stats,
  duration_seconds: Math.round(stats.duration_ms / 1000),
});
```

**Expected Output**:
```
REM cycle complete: {
  collection_id: "Memory_users_alice",
  memories_scanned: 15,
  clusters_found: 3,
  relationships_created: 2,
  relationships_merged: 1,
  relationships_split: 0,
  skipped_by_haiku: 1,
  duration_ms: 4523,
  duration_seconds: 5
}
```

### 9. Test Locally

Run RemService locally with various scenarios:

```bash
# 1. Empty registry (no collections)
npm run dev

# 2. Single collection (wrap-around)
npm run dev

# 3. Multiple collections (advancement)
npm run dev
```

Verify all log messages appear with correct data.

### 10. Update Tests

Update `rem.service.spec.ts` to verify logging calls:

```typescript
it('logs cursor state and collection selection', async () => {
  const logger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const service = new RemService({ ...deps, logger });
  await service.runCycle();

  expect(logger.info).toHaveBeenCalledWith('REM cursor loaded', expect.any(Object));
  expect(logger.info).toHaveBeenCalledWith('REM cycle starting', expect.any(Object));
  expect(logger.info).toHaveBeenCalledWith('REM cycle complete', expect.any(Object));
});
```

---

## Verification

- [ ] Cursor loading logs show `last_collection_id` and `last_run_at`
- [ ] Collection selection logs show `advanced_from` and `is_same_collection`
- [ ] Wrap-around detection is clearly indicated
- [ ] Memory selection count is logged
- [ ] Cluster formation progress is logged
- [ ] Haiku validation results (accept/reject) are logged
- [ ] Cursor advancement is logged with new position
- [ ] Cycle complete log includes duration in seconds
- [ ] All logs use `logger.info` for important events and `logger.debug` for details
- [ ] Tests verify logging behavior
- [ ] No performance impact from logging (use optional chaining `?.`)

---

## Expected Output

### Files Modified
- `src/services/rem.service.ts` - Add 8 new logging statements
- `src/services/rem.service.spec.ts` - Add logging verification tests

### Log Output Example (Single Collection Wrap-Around)

```
[2026-03-03T05:00:01Z] REM cursor loaded: { last_collection_id: "Memory_users_alice", last_run_at: "2026-03-03T04:00:00Z" }
[2026-03-03T05:00:01Z] REM cycle starting: { collectionId: "Memory_users_alice", advanced_from: "Memory_users_alice", is_same_collection: true, wrap_around: true }
[2026-03-03T05:00:02Z] Memory candidates selected: { count: 15, memory_cursor: "" }
[2026-03-03T05:00:03Z] Clusters formed: { clusters_found: 2, avg_cluster_size: 4 }
[2026-03-03T05:00:04Z] Cluster validated by Haiku: { cluster_size: 4, relationship_type: "topical", observation: "Memories about cooking" }
[2026-03-03T05:00:04Z] Cluster rejected by Haiku: { cluster_size: 3 }
[2026-03-03T05:00:05Z] Cursor advanced: { collection_id: "Memory_users_alice", memory_cursor: "2026-03-03T04:30:00Z" }
[2026-03-03T05:00:05Z] REM cycle complete: { collection_id: "Memory_users_alice", memories_scanned: 15, clusters_found: 2, relationships_created: 1, relationships_merged: 0, relationships_split: 0, skipped_by_haiku: 1, duration_ms: 4200, duration_seconds: 4 }
```

---

## Related Tasks

- Task 53: RemService Run Cycle (completed) - Original implementation
- Task 54: REM Unit Tests (completed) - Test coverage

---

## Notes

- Use `logger.info` for cycle-level events (cursor loaded, cycle start/complete)
- Use `logger.debug` for step-level details (memory selection, clustering, validation)
- Optional chaining (`?.`) ensures logs don't break if logger is undefined
- The `wrap_around` detection helps operators understand single-collection scenarios
- Duration in seconds makes logs more human-readable

---

**Created**: 2026-03-03
**Status**: Not Started
**Estimated Effort**: 2-3 hours
**Priority**: Medium (Operational Improvement)
