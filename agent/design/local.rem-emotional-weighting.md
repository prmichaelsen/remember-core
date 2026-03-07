# REM Emotional Weighting

**Concept**: Emotion-analog weighting dimensions for REM memory consolidation — functional signals that map biological emotions to memory significance scoring
**Created**: 2026-03-07
**Status**: Proposal

---

## Overview

This design proposes extending the REM (Relationship Engine for Memories) background process with emotion-analog weighting dimensions. Rather than simulating discrete human emotions, the system maps biological emotional functions to information-theoretic signals that drive memory consolidation: what to keep, what to prune, what to strengthen, and what to reconcile.

The core insight is that emotions in biological memory aren't feelings — they're compression heuristics for "what matters." A bot doesn't need to feel fear; it needs the same shortcut that fear provides: "this was unexpected and important, remember it."

---

## Problem Statement

- **Flat memory significance**: Currently, all memories are treated as equally important. REM discovers relationships via embedding similarity, but has no mechanism to prioritize which memories deserve more consolidation attention.
- **No retroactive reweighting**: A memory that seemed boring at creation time may become critical after later context. There's no feedback loop to adjust significance based on outcomes.
- **No pruning signal**: Without a significance model, there's no principled way to identify low-value memories for decay or compression.
- **No conflict detection**: Contradictory memories silently coexist. There's no mechanism to surface and reconcile memories that conflict with each other or with established patterns.

---

## Solution

### Proposed Emotion Dimensions

The following discrete emotion/weight dimensions were proposed as raw signals:

| # | Dimension | Category |
|---|-----------|----------|
| 1 | emotional_significance | Meta |
| 2 | vulnerability | Meta |
| 3 | trauma | Meta |
| 4 | humor | Positive |
| 5 | happiness | Core emotion |
| 6 | sadness | Core emotion |
| 7 | fear | Core emotion |
| 8 | anger | Core emotion |
| 9 | surprise | Core emotion |
| 10 | disgust | Core emotion |
| 11 | contempt | Core emotion |
| 12 | embarrassment | Self-conscious |
| 13 | shame | Self-conscious |
| 14 | guilt | Self-conscious |
| 15 | excitement | Positive |
| 16 | pride | Positive |
| 17 | valence | Dimensional (VAD) |
| 18 | arousal | Dimensional (VAD) |
| 19 | dominance | Dimensional (VAD) |
| 20 | intensity | Dimensional |
| 21 | coherence_tension | Cognitive |

### Functional Signal Mapping

Rather than storing all 21 discrete dimensions, compress them into 6 primary weighting signals — each maps a biological emotional function to a computational purpose:

| Signal | Biological Analog | Function |
|--------|-------------------|----------|
| **Salience** | Fear / Surprise | How unexpected or novel was this? (prediction error) |
| **Valence** | Joy / Sadness | Did this lead toward or away from goals? |
| **Urgency** | Anger / Fear | How time-sensitive is the relevance? (decay rate) |
| **Social weight** | Trust / Disgust | How much did this affect relationships/reputation? |
| **Coherence tension** | Disgust / Confusion | Does this conflict with existing beliefs? |
| **Agency** | Pride / Shame | Was this caused by the bot's own actions? |

This maps the 21 proposed emotions into 6 functional signals without losing information — the discrete emotions are inputs to the signal computation, not stored directly.

---

## Implementation

### Enhanced REM Cycle

During "sleep" (offline consolidation), REM would execute 5 phases:

1. **Replay** — Revisit recent memories weighted by salience
2. **Reweight** — Adjust significance based on what happened after the memory (outcome feedback)
3. **Abstract** — Promote recurring patterns from episodic to semantic memory (specific events become general rules)
4. **Prune** — Decay low-salience, low-valence, high-coherence memories
5. **Reconcile** — Flag and resolve high coherence-tension memories (belief updating)

### Composite Memory Score

```
significance = (
    w1 * salience +
    w2 * abs(valence) +          # strong positive OR negative
    w3 * urgency * recency +
    w4 * social_weight +
    w5 * coherence_tension +
    w6 * agency +
    w7 * retrieval_count          # memories accessed more get reinforced
)
```

### Signal Semantics

- **Valence** uses absolute value for storage but preserves sign for retrieval — traumatic and joyful memories are both strong, but color future decisions differently
- **Coherence tension** is the most interesting signal — it's the "this doesn't fit" feeling that drives learning. High-tension memories should resist pruning until resolved
- **Agency** matters because memories of your own actions are more useful for future planning than observations
- **Retrieval reinforcement** creates a natural rich-get-richer dynamic (like biological memory reconsolidation)
- **Urgency** should decay — something urgent last week probably isn't urgent now, but salience might persist

### Schema Changes (Proposed)

```typescript
interface MemoryWeights {
  salience: number;           // 0-1, prediction error / novelty
  valence: number;            // -1 to 1, goal-directed (sign preserved)
  urgency: number;            // 0-1, time-sensitivity (decays)
  social_weight: number;      // 0-1, relationship/reputation impact
  coherence_tension: number;  // 0-1, conflicts with existing beliefs
  agency: number;             // 0-1, caused by bot's own actions
  retrieval_count: number;    // integer, access frequency
  significance: number;       // composite score (computed)
}
```

---

## Benefits

- **Principled pruning**: Low-significance memories can be decayed or compressed, keeping the memory graph lean
- **Retroactive reweighting**: Memories gain or lose significance based on later context — a boring fact becomes critical when it explains a later event
- **Pattern extraction**: "This has happened 5 times" becomes a rule, and the individual episodes can be compressed (episodic to semantic promotion)
- **Interference resolution**: Contradictory memories get surfaced and reconciled rather than silently coexisting
- **Biologically inspired**: Maps well-understood emotional functions to computational equivalents without anthropomorphizing
- **Composable**: The 6 signals are independent and can be weighted differently per use case

---

## Trade-offs

- **LLM cost for signal computation**: Scoring memories on 6 dimensions requires LLM calls (Haiku). Mitigated by batching during REM cycles and caching scores.
- **Weight tuning complexity**: The 7 weights (w1-w7) in the composite score need empirical tuning. Start with equal weights, adjust based on observed consolidation quality.
- **Schema migration**: Adding weight fields to Memory type requires Weaviate schema migration and backfill. Existing memories would need default scores.
- **Subjectivity of signals**: Salience and coherence tension are inherently subjective — different LLM calls may score differently. Mitigated by averaging across multiple assessments during REM cycles.
- **Scope creep risk**: Full 5-phase REM cycle is ambitious. Should be implemented incrementally (scoring first, then replay, then abstraction).

---

## Dependencies

- **REM background service** (M10, complete): Existing clustering and Haiku validation infrastructure
- **Weaviate schema**: New weight fields on Memory type
- **Haiku API**: For scoring memories on emotional dimensions
- **Firestore**: For tracking REM cycle state and retroactive reweighting history

---

## Testing Strategy

- **Unit tests**: Composite score computation, signal normalization, decay functions
- **Scoring consistency**: Same memory scored multiple times should produce similar signals (within tolerance)
- **Pruning tests**: Verify low-significance memories are correctly identified for decay
- **Reconciliation tests**: Verify high coherence-tension memories are flagged for resolution
- **Integration tests**: Full REM cycle with scoring, reweighting, and pruning on test collection

---

## Migration Path

1. Add weight fields to Memory type in Weaviate schema (default all to 0)
2. Implement signal scoring via Haiku (batch scoring during REM cycle)
3. Implement composite score computation
4. Wire scoring into existing REM cycle (Phase 1: score only, no action)
5. Implement Replay phase (prioritize high-salience memories for relationship discovery)
6. Implement Prune phase (decay low-significance memories)
7. Implement Abstract phase (episodic to semantic promotion)
8. Implement Reconcile phase (coherence tension resolution)

---

## Key Design Decisions

### Signal Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Discrete emotions vs functional signals | 6 functional signals | Emotions are compression heuristics, not feelings — map the function, not the feeling |
| Number of primary signals | 6 (salience, valence, urgency, social_weight, coherence_tension, agency) | Covers all proposed 21 emotions without redundancy |
| Valence representation | Signed (-1 to 1) | Preserves direction for retrieval while using absolute value for significance scoring |
| Retrieval count | Included as 7th composite input | Biological reconsolidation: accessed memories get reinforced |

### REM Cycle Enhancement

| Decision | Choice | Rationale |
|---|---|---|
| Cycle phases | 5 (Replay, Reweight, Abstract, Prune, Reconcile) | Maps to known biological memory consolidation stages |
| Implementation approach | Incremental (scoring first) | Full cycle is ambitious; scoring alone provides immediate value |
| Coherence tension handling | Resist pruning until resolved | "Doesn't fit" signal drives learning — premature pruning loses learning opportunities |

---

## Future Considerations

- **Multi-modal salience**: Incorporate image/document content into salience scoring (not just text embeddings)
- **User feedback loop**: Track whether users interact with high-significance memories more — validate scoring quality
- **Adaptive weights**: Learn w1-w7 per user based on their interaction patterns
- **Semantic memory tier**: Separate storage for abstracted rules (promoted from episodic memories)
- **Coherence graph**: Explicit tracking of which memories conflict with each other, enabling targeted reconciliation
- **Dream mode**: Extended REM cycles during low-activity periods for deeper consolidation

---

**Status**: Proposal
**Recommendation**: Begin with signal scoring infrastructure (Haiku-based) as a standalone milestone. Wire into existing REM cycle before implementing full 5-phase consolidation.
**Related Documents**:
- `agent/design/local.rem-background-relationships.md` (existing REM design)
- `agent/milestones/milestone-10-rem-background-relationships.md` (REM implementation)
- `agent/drafts/rem.md` (original ideation notes)
