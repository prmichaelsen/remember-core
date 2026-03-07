# Task 151: REM Metadata Tracking

**Milestone**: [M28 - REM Emotional Weighting -- Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 145
**Status**: Not Started

---

## Objective

Implement `rem_touched_at` and `rem_visits` tracking on memories to record when and how often REM has scored each memory, enabling prioritized scoring in Phase 0 and providing observability into REM coverage.

---

## Context

REM metadata serves two primary purposes:

1. **Scoring prioritization** (Task 149): Phase 0 uses `rem_touched_at` to determine which memories to score next. Memories with null `rem_touched_at` (never scored) are processed first. Memories with the oldest `rem_touched_at` (scored longest ago) are refreshed next.

2. **Observability**: `rem_visits` tracks how many times REM has processed each memory, providing insight into REM coverage and activity.

These fields are REM-only -- they cannot be set via `create_memory` (Task 146). Only Phase 0 sets them after scoring a memory.

---

## Key Design Decisions

### REM Metadata

| Decision | Choice | Rationale |
|---|---|---|
| `rem_touched_at` type | ISO timestamp string (TEXT in Weaviate) | Records last REM scoring time |
| `rem_visits` type | Integer (INT in Weaviate, default 0) | Counts total REM scoring passes |
| Settable via create_memory | No -- REM-only fields | Only REM Phase 0 should set these |
| Update timing | After scoring completes for a memory | Marks successful scoring |
| Initial values | `rem_touched_at`: null, `rem_visits`: 0 | Schema defaults from Task 145 |

---

## Steps

### 1. Create REM Metadata Update Function

Implement a function to update REM metadata on a memory after scoring:

```typescript
interface RemMetadataUpdate {
  rem_touched_at: string;  // ISO timestamp, e.g., new Date().toISOString()
  rem_visits: number;      // Previous value + 1
}

async function updateRemMetadata(
  memoryId: string,
  collectionId: string,
  currentVisits: number
): Promise<void>
```

- Set `rem_touched_at` to the current ISO timestamp (`new Date().toISOString()`)
- Set `rem_visits` to `currentVisits + 1`
- This update is included in the same Weaviate update operation as dimension scores (Task 149) -- not a separate call

### 2. Integrate with Phase 0 Scoring Loop

In the Phase 0 batch processing loop (Task 149), after scoring all 31 dimensions and computing composites for a memory:
- Read the memory's current `rem_visits` value (from the batch query)
- Include `rem_touched_at` and `rem_visits` in the Weaviate update alongside scores and composites
- This ensures atomicity -- scores and metadata are persisted together

### 3. Add to Memory Response Types

Include `rem_touched_at` and `rem_visits` in memory response types so they are visible when querying memories. These are read-only fields in API responses (not settable via create/update).

### 4. Support Priority Queries

Ensure Weaviate queries can filter and sort by REM metadata for Phase 0's priority logic:
- Filter: `rem_touched_at IS NULL` (unscored memories)
- Sort: `rem_touched_at ASC` (oldest-scored first among scored memories)
- Both must work with Weaviate's query capabilities

### 5. Write Tests

Create colocated `.spec.ts` tests:
- `rem_touched_at` set to valid ISO timestamp after REM scores a memory
- `rem_visits` incremented from 0 to 1 on first scoring
- `rem_visits` incremented from N to N+1 on subsequent scorings
- `rem_visits` starts at 0 for new memories (schema default)
- Both fields visible in memory response types
- Both fields correctly persisted and retrievable from Weaviate
- Weaviate can filter by `rem_touched_at IS NULL`
- Weaviate can sort by `rem_touched_at ASC`
- `rem_touched_at` and `rem_visits` not settable via `create_memory` API

---

## Verification

- [ ] `rem_touched_at` set to current ISO timestamp after REM scores a memory
- [ ] `rem_visits` incremented by 1 after each REM scoring pass
- [ ] `rem_visits` starts at 0 for new memories (from schema default in Task 145)
- [ ] `rem_touched_at` starts as null for new memories
- [ ] Both fields visible in memory response types (read-only)
- [ ] Both fields NOT settable via `create_memory` input
- [ ] Both fields persisted in same Weaviate update as dimension scores
- [ ] Weaviate supports filtering by null `rem_touched_at` (for unscored memory selection)
- [ ] Weaviate supports sorting by `rem_touched_at` ascending (for oldest-scored selection)
- [ ] Tests colocated with source file using `.spec.ts` suffix
- [ ] All tests pass

---

## Expected Output

Every memory scored by REM has an updated `rem_touched_at` ISO timestamp and an incremented `rem_visits` counter, both persisted atomically alongside dimension scores. These fields enable Phase 0's priority-based memory selection (unscored first, then oldest-scored) and provide observability into REM coverage. Fields are read-only in API responses and not settable via create/update.

---

**Next Task**: [task-152-by-property-sort-mode.md](./task-152-by-property-sort-mode.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
