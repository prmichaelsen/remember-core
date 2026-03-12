# Task 515: Sync Mood State to Weaviate Memory

**Milestone**: M76 — Synthetic Core Space
**Status**: not_started
**Estimated Hours**: 2
**Dependencies**: T512 (formatMoodAsMemory formatter)

---

## Objective

After each REM cycle mood update, upsert a real Weaviate memory containing the formatted mood state. This makes mood searchable through normal memory search — no synthetic space interception, no special tools, no new consumer logic.

## Context

The synthetic core space (T511-T513) added significant complexity across SpaceService to intercept `'core'` in every sort mode. A simpler approach: just write the mood as a regular memory. The `formatMoodAsMemory()` formatter from T512 already produces a memory-shaped object — we just need to persist it to Weaviate instead of returning it on-the-fly.

After this task, the synthetic space machinery (T511/T513) can be removed in a follow-up cleanup task.

## Steps

### 1. Create a deterministic mood memory ID

Use a deterministic UUID for the mood memory so upserts replace the previous version:

```typescript
import { v5 as uuidv5 } from 'uuid';

const MOOD_MEMORY_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace
function getMoodMemoryId(userId: string, ghostCompositeId: string): string {
  return uuidv5(`mood:${userId}:${ghostCompositeId}`, MOOD_MEMORY_NAMESPACE);
}
```

This ensures the same user+ghost always maps to the same memory UUID — updates overwrite rather than creating duplicates.

### 2. Add mood memory upsert to `RemService.runMoodUpdate()`

In `src/services/rem.service.ts`, after the mood is updated in Firestore (line ~764), upsert a Weaviate memory:

```typescript
// After moodService.updateMood() and moodService.setPressures():
const moodMemory = formatMoodAsMemory(updatedMood, userId);
const moodMemoryId = getMoodMemoryId(userId, ghostCompositeId);

// Upsert to user's collection
await collection.data.replace({
  id: moodMemoryId,
  properties: {
    ...moodMemory,
    id: undefined, // strip synthetic ID
    doc_type: 'memory',
    content_type: 'system',
  },
});
```

Use `replace` (not `insert`) so it overwrites the previous mood memory. If the memory doesn't exist yet, use `insert` with a try/catch fallback.

### 3. Tag with content_type 'system'

The mood memory should use `content_type: 'system'` so it's excluded from default searches (system types are filtered by default) but still searchable when explicitly requested via `content_type: 'system'` filter.

### 4. Include narration labels

The formatted content should include the derived labels from the narration step (which runs after mood update in the REM cycle):

```
Current mood: content (warm amber)
Reasoning: stable interactions
Valence: 0.6, Arousal: 0.4, Confidence: 0.7
Social Warmth: 0.5, Coherence: 0.8, Trust: 0.9
Motivation: keep building
Goal: ship M76
Purpose: help users remember
Active pressures: 3
Last updated: 2026-03-12T10:00:00Z
```

### 5. Tests

- Mood memory is created after first REM cycle mood update
- Mood memory is overwritten (not duplicated) on subsequent updates
- Memory uses deterministic UUID based on userId + ghostCompositeId
- Memory has `content_type: 'system'` and `doc_type: 'memory'`
- Memory content includes all 6 mood dimensions
- Memory content is human-readable
- No mood memory created if moodService is not configured

## Verification

- [ ] `RemService.runMoodUpdate()` upserts mood memory to Weaviate after Firestore update
- [ ] Mood memory uses deterministic UUID (no duplicates)
- [ ] `content_type` is `'system'` (excluded from default searches)
- [ ] Content includes all mood dimensions and derived labels
- [ ] Existing `formatMoodAsMemory()` from T512 is reused
- [ ] No mood memory created when moodService is absent
- [ ] All existing REM tests pass
- [ ] Colocated tests in `.spec.ts`
