# Task 512: Mood/Perception Formatters

**Milestone**: M76 — Synthetic Core Space
**Status**: not_started
**Estimated Hours**: 2
**Dependencies**: T513 (registry interface)

---

## Objective

Create formatters that convert MoodService and PerceptionService output into memory-shaped objects for the synthetic core space.

## Steps

### 1. Mood formatter

```typescript
export function formatMoodAsMemory(
  mood: CoreMoodMemory,
  userId: string,
): Record<string, unknown> {
  return {
    id: `synthetic:mood:${userId}`,
    doc_type: 'memory',
    content_type: 'system',
    content: buildMoodContent(mood),
    title: 'Current Mood State',
    tags: ['core', 'mood', 'synthetic'],
    created_at: mood.last_updated,
    updated_at: mood.last_updated,
    user_id: userId,
    // Flatten mood dimensions as top-level properties
    // so they're searchable/filterable like real memories
    ...flattenMoodState(mood.state),
  };
}
```

`buildMoodContent()` should produce a human-readable summary:
```
Current mood: [label/derivation]
Valence: 0.6, Arousal: 0.4, Confidence: 0.7
Social Warmth: 0.5, Coherence: 0.8, Trust: 0.9
Active pressures: 3
Last updated: 2026-03-12T00:00:00Z
```

### 2. Perception formatter

```typescript
export function formatPerceptionAsMemory(
  perception: UserPerception,
  userId: string,
): Record<string, unknown>
```

Similar pattern — formats user perception state as a memory-shaped object.

### 3. Register formatters

Create concrete `SyntheticMemoryProvider` implementations:

```typescript
class MoodMemoryProvider implements SyntheticMemoryProvider {
  constructor(private moodService: MoodService) {}

  async fetch(userId: string, ghostCompositeId: string): Promise<Record<string, unknown> | null> {
    const mood = await this.moodService.getMood(userId, ghostCompositeId);
    if (!mood) return null;
    return formatMoodAsMemory(mood, userId);
  }
}
```

### 4. Tests

- Mood formatter produces valid memory shape
- Mood formatter includes all 6 dimensions
- Null mood returns null (provider skips)
- Perception formatter produces valid memory shape
- Content string is human-readable

## Verification

- [ ] `formatMoodAsMemory()` returns memory-shaped object
- [ ] All mood dimensions present in output
- [ ] Content is human-readable for LLM consumption
- [ ] Null/missing mood handled gracefully
- [ ] Perception formatter works same pattern
- [ ] Colocated tests in `.spec.ts`
