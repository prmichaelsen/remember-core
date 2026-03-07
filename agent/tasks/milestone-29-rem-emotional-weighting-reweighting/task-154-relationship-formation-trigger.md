# Task 154: Relationship Formation Trigger

**Milestone**: M29 — REM Emotional Weighting — Retroactive Reweighting
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 153, M10 (REM Background Relationships)

---

## Objective

Implement the event-driven relationship formation trigger (Trigger B). When REM forms a new relationship between two memories, both memories are flagged for selective re-evaluation because the new relationship context can dramatically shift emotional significance.

---

## Key Design Decisions

| Decision | Choice | Source |
|----------|--------|--------|
| Trigger type | Event-driven — fires when REM creates a relationship | Clarification 18-19 |
| Scope | Both source AND target memories are re-evaluated | Clarification 19 |
| Re-scoring approach | Selective — sub-LLM picks impacted dimensions | Clarification 19 |
| Composite recomputation | Required after partial re-scoring | Design doc: Composite Scores |
| REM metadata updates | `rem_touched_at` and `rem_visits` updated on both memories | Design doc: REM Metadata |
| Timing | Fires immediately during the REM cycle when the relationship is formed, not deferred to next cycle | Clarification 19 |
| Context includes new relationship | The newly formed relationship and its observation text are included in re-evaluation context | Design doc: Scoring Architecture |

---

## Concrete Example

**Trigger B — Relationship formation:**

> A banana bread recipe memory was scored with `functional_salience: 0.1` and `feel_emotional_significance: 0.1` at creation — a mundane recipe. During a REM cycle, the clustering algorithm discovers relationships between this memory and three others: "mom's last birthday", "cooking with family", and "grief processing through baking". When each relationship is formed, this trigger fires. The selective re-evaluation (Task 156) identifies `feel_emotional_significance`, `feel_sadness`, `functional_narrative_importance`, and `functional_social_weight` as impacted dimensions. After re-scoring: `feel_emotional_significance: 0.8`, `feel_sadness: 0.6`, `functional_narrative_importance: 0.7`. The banana bread recipe transforms from a mundane memory into an emotionally significant one anchored to grief and family.

---

## Steps

### 1. Define the Relationship Formation Hook

Create a hook/callback interface that the REM relationship creation pipeline calls after successfully persisting a new relationship. The hook receives:

```typescript
interface RelationshipFormationEvent {
  relationship: Relationship;              // The newly created relationship
  sourceMemory: Memory;                    // Source memory with current scores
  targetMemory: Memory;                    // Target memory with current scores
  relationshipObservation: string;         // The observation/description of the relationship
  cycleId: string;                         // Current REM cycle identifier
}
```

### 2. Implement the Trigger Handler

Create `onRelationshipFormed(event: RelationshipFormationEvent)` that:

1. Identifies both source and target memories as re-evaluation candidates
2. De-duplicates: if a memory has already been re-evaluated via this trigger in the current cycle (tracked via a Set of memory IDs), skip it to avoid redundant re-scoring when a memory gains multiple relationships in one cycle
3. For each candidate, assembles the re-evaluation context

### 3. Assemble Re-evaluation Context

For each memory (source and target), gather:

```typescript
interface ReEvaluationContext {
  memory: Memory;                          // The candidate memory with current scores
  newRelationships: Relationship[];        // The newly formed relationship (+ any others formed this cycle)
  recentRelatedMemories: Memory[];         // The other memory in the relationship + other neighbors
  relationshipObservations: string[];      // Observations from all connected memories (including new)
  collectionEmotionalAverages: Record<string, number>; // Cached per-cycle
  triggerType: 'relationship_formation';   // Discriminator for trigger source
}
```

The key context difference from Trigger A: the newly formed relationship and the other memory's content/observation are the primary new information driving re-evaluation.

### 4. Invoke Selective Re-evaluation

For each candidate memory:

1. Call `analyzeImpactedDimensions(memory, context)` (Task 156) — the sub-LLM sees the new relationship and determines which dimensions it impacts
2. Re-score only impacted dimensions via per-dimension Haiku calls
3. Merge partial new scores with existing scores
4. Recompute `feel_significance`, `functional_significance`, `total_significance`

### 5. Update REM Metadata

After re-evaluation of each memory:

- Set `rem_touched_at` to current ISO timestamp
- Increment `rem_visits` by 1
- Persist all changes in a single Weaviate update

### 6. Integrate into REM Relationship Creation Pipeline

Wire the hook into the existing REM relationship creation flow (from M10). The integration point is after `createRelationship()` succeeds and persists:

- Register `onRelationshipFormed` as a post-creation callback
- Maintain a per-cycle Set of already-re-evaluated memory IDs for deduplication
- Respect the emotional scoring cost cap
- Log relationship formation triggers: source memory ID, target memory ID, dimensions re-scored

### 7. Handle Batch Relationship Formation

During a single REM cycle, REM may form many relationships. Optimize for this:

- Collect all relationship formation events during the cycle
- Batch the re-evaluation: a memory that gains 5 new relationships should be re-evaluated once with all 5 relationships as context, not 5 separate times
- Implementation: use the deduplication Set from Step 2. First relationship triggers re-evaluation; subsequent relationships for the same memory in the same cycle are absorbed into a "pending re-evaluation" queue and processed together at the end of the relationship phase

### 8. Implement Tests

Create `src/rem/triggers/relationship-trigger.spec.ts` (colocated with source):

- Test that hook fires when a new relationship is created
- Test that both source and target memories are flagged for re-evaluation
- Test deduplication: memory gaining 3 relationships in one cycle is re-evaluated once, not 3 times
- Test that context includes the new relationship observation text
- Test that selective re-evaluation is invoked with `triggerType: 'relationship_formation'`
- Test that composites are recomputed after partial re-scoring
- Test that `rem_touched_at` and `rem_visits` are updated on both memories
- Test that emotional scoring cost cap is respected
- Test banana bread example: recipe + grief clustering triggers re-evaluation of emotional significance

---

## Verification

- [ ] Hook fires on every new relationship creation during REM cycle
- [ ] Both source and target memories are flagged for re-evaluation
- [ ] Deduplication prevents redundant re-evaluation of the same memory in one cycle
- [ ] Context payload includes the new relationship observation text and the related memory
- [ ] Selective re-evaluation (Task 156) invoked with `triggerType: 'relationship_formation'`
- [ ] Only impacted dimensions are re-scored, not all 31
- [ ] Composite scores (`feel_significance`, `functional_significance`, `total_significance`) recomputed
- [ ] `rem_touched_at` updated on both source and target memories
- [ ] `rem_visits` incremented on both source and target memories
- [ ] Batch optimization: memory with multiple new relationships re-evaluated once with all relationships as context
- [ ] Emotional scoring cost cap enforced
- [ ] No regression in existing REM relationship creation flow
- [ ] All tests pass with mocked Weaviate and Haiku responses

---

## Expected Output

- `src/rem/triggers/relationship-trigger.ts` — hook handler + context assembly + batch deduplication
- `src/rem/triggers/relationship-trigger.spec.ts` — unit tests
- Integration into M10 REM relationship creation pipeline as post-creation callback
- Memories re-scored when new relationships reveal hidden emotional significance

---

**Next Task**: [task-155-retrieval-threshold-trigger.md](./task-155-retrieval-threshold-trigger.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md` (Retroactive Reweighting section)
**Clarifications**: 18 (trigger definition), 19 (banana bread example)
