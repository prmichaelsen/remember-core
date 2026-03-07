# Task 168: Mood-Biased Retrieval Reranking

**Milestone**: M33 — Retrieval Bias & Significance
**Status**: Not Started
**Estimated Hours**: 3-4
**Dependencies**: M32 (Core Mood State)

---

## Objective

Implement `applyMoodBias()` — a post-search reranking function that adjusts `computed_weight` based on the ghost's current mood state. The mood memory acts as a filter on all memory retrieval.

## Context

- **Design doc**: `agent/design/core-mood-memory.md` — section "Retrieval Bias"
- Mood-biased retrieval surfaces memories that are contextually appropriate to the ghost's current state
- The bias multiplies `computed_weight`, then results are re-sorted
- Includes self-correction bias to prevent negative spirals (negative mood slightly boosts positive memory retrieval)

## Full Implementation

```typescript
function applyMoodBias(results: Memory[], mood: CoreMoodMemory): Memory[] {
  return results.map(memory => {
    let biasMultiplier = 1.0;

    // Low confidence: boost memories of past failures (checking for pitfalls)
    if (mood.state.confidence < 0.3) {
      if (memory.tags?.includes('failure') || memory.tags?.includes('lesson')) {
        biasMultiplier *= 1.3;
      }
    }

    // High social warmth: boost collaborative/positive interaction memories
    if (mood.state.social_warmth > 0.7) {
      if (memory.content_type === 'conversation' || memory.tags?.includes('collaboration')) {
        biasMultiplier *= 1.2;
      }
    }

    // Low coherence: boost contradictory memories (trying to resolve them)
    if (mood.state.coherence < 0.4) {
      if (memory.tags?.includes('contradiction') || memory.tags?.includes('unresolved')) {
        biasMultiplier *= 1.4;
      }
    }

    // Negative valence: slight boost to positive memories (self-correction)
    if (mood.state.valence < -0.5) {
      if (memory.weight > 0.7 && memory.tags?.includes('positive')) {
        biasMultiplier *= 1.15;
      }
    }

    // Low trust: boost memories that validate caution (past betrayals, broken promises)
    if (mood.state.trust < 0.3) {
      if (memory.tags?.includes('betrayal') || memory.tags?.includes('broken_promise')) {
        biasMultiplier *= 1.3;
      }
      // Also suppress overly personal memories from surfacing
      if (memory.trust > 0.7) {
        biasMultiplier *= 0.7;
      }
    }

    // High trust: boost memories that deepen connection
    if (mood.state.trust > 0.8) {
      if (memory.tags?.includes('shared_experience') || memory.tags?.includes('vulnerability')) {
        biasMultiplier *= 1.2;
      }
    }

    return {
      ...memory,
      computed_weight: memory.computed_weight * biasMultiplier
    };
  });
}
```

## Bias Rules Summary

| Condition | Tag/Type Match | Multiplier | Purpose |
|-----------|---------------|------------|---------|
| confidence < 0.3 | `failure`, `lesson` | 1.3x boost | Check for pitfalls |
| social_warmth > 0.7 | `conversation` type, `collaboration` tag | 1.2x boost | Surface collaborative memories |
| coherence < 0.4 | `contradiction`, `unresolved` | 1.4x boost | Try to resolve conflicts |
| valence < -0.5 | weight > 0.7 AND `positive` tag | 1.15x boost | Self-correction against negative spiral |
| trust < 0.3 | `betrayal`, `broken_promise` | 1.3x boost | Validate caution |
| trust < 0.3 | memory.trust > 0.7 | 0.7x suppress | Suppress overly personal memories |
| trust > 0.8 | `shared_experience`, `vulnerability` | 1.2x boost | Deepen connection |

## Integration Point

- Wire into `MemoryService` search pipeline as a post-processing step
- The function is **optional** -- if no mood state exists for the user, skip bias entirely (return results unchanged)
- After applying bias, re-sort results by the updated `computed_weight`
- Neutral mood (all dimensions at 0.5, valence at 0) should produce **no change** to any result (no bias rules trigger)

## Steps

1. Create `applyMoodBias(results: Memory[], mood: CoreMoodMemory): Memory[]` function
2. Implement all 7 bias rules from the table above
3. Multiple bias rules can stack (e.g., a memory with `failure` tag during low confidence AND low coherence gets both boosts)
4. Wire into MemoryService search pipeline — call after standard search, before returning results
5. Check if mood exists first (`MoodService.getMood()`); if null, skip bias entirely
6. Re-sort results by updated `computed_weight` after bias application

## Verification

- [ ] Each mood dimension produces correct bias multiplier
- [ ] Low confidence boosts failure/lesson tags by 1.3x
- [ ] High social_warmth boosts conversation type and collaboration tag by 1.2x
- [ ] Low coherence boosts contradiction/unresolved tags by 1.4x
- [ ] Negative valence boosts positive high-weight memories by 1.15x (self-correction)
- [ ] Low trust boosts betrayal/broken_promise by 1.3x AND suppresses high-trust memories by 0.7x
- [ ] High trust boosts shared_experience/vulnerability by 1.2x
- [ ] Multiple bias rules stack correctly
- [ ] Neutral mood (default state) produces no change to any result
- [ ] Gracefully skips when no mood state exists (returns results unchanged)
- [ ] Results re-sorted by updated computed_weight after bias
- [ ] Tests colocated: appropriate `.spec.ts` file alongside implementation
