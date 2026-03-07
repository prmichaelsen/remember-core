# REM Emotional Weighting

**Concept**: Emotion-analog weighting dimensions for REM memory consolidation — functional signals that map biological emotions to memory significance scoring
**Created**: 2026-03-07
**Status**: Design Specification (Clarifications 18-19 completed)

---

## Overview

This design extends the REM (Relationship Engine for Memories) background process with emotion-analog weighting dimensions. Two independent layers of dimensions are scored per memory and stored in Weaviate: 21 discrete emotional dimensions and 10 functional signals (31 total). Both layers are scored independently by Haiku — functional signals are not derived from discrete emotions.

The core insight is that emotions in biological memory aren't feelings — they're compression heuristics for "what matters." A bot doesn't need to feel fear; it needs the same shortcut that fear provides: "this was unexpected and important, remember it."

---

## Problem Statement

- **Flat memory significance**: Currently, all memories are treated as equally important. REM discovers relationships via embedding similarity, but has no mechanism to prioritize which memories deserve more consolidation attention.
- **No retroactive reweighting**: A memory that seemed boring at creation time may become critical after later context. There's no feedback loop to adjust significance based on outcomes.
- **No pruning signal**: Without a significance model, there's no principled way to identify low-value memories for decay or compression.
- **No conflict detection**: Contradictory memories silently coexist. There's no mechanism to surface and reconcile memories that conflict with each other or with established patterns.

---

## Solution

### Layer 1: Discrete Emotion Dimensions (21)

All 21 dimensions stored as individual Weaviate properties with `feel_` prefix. Scored as 0-1 floats.

| # | Property | Category | Description |
|---|----------|----------|-------------|
| 1 | `feel_emotional_significance` | Meta | Overall emotional weight of the memory |
| 2 | `feel_vulnerability` | Meta | Degree of personal exposure or openness |
| 3 | `feel_trauma` | Meta | Intensity of negative formative experience |
| 4 | `feel_humor` | Positive | Comedic or playful quality |
| 5 | `feel_happiness` | Core emotion | Positive affect / joy |
| 6 | `feel_sadness` | Core emotion | Negative affect / grief / loss |
| 7 | `feel_fear` | Core emotion | Threat perception / anxiety |
| 8 | `feel_anger` | Core emotion | Frustration / injustice response |
| 9 | `feel_surprise` | Core emotion | Unexpectedness / novelty |
| 10 | `feel_disgust` | Core emotion | Aversion / rejection response |
| 11 | `feel_contempt` | Core emotion | Superiority / dismissal |
| 12 | `feel_embarrassment` | Self-conscious | Social discomfort from perceived misstep |
| 13 | `feel_shame` | Self-conscious | Deep self-judgment, identity-level |
| 14 | `feel_guilt` | Self-conscious | Responsibility for harm caused |
| 15 | `feel_excitement` | Positive | Anticipatory positive arousal |
| 16 | `feel_pride` | Positive | Positive self-evaluation / accomplishment |
| 17 | `feel_valence` | Dimensional (VAD) | Positive-negative spectrum (-1 to 1) |
| 18 | `feel_arousal` | Dimensional (VAD) | Activation level, calm to excited |
| 19 | `feel_dominance` | Dimensional (VAD) | Feeling of control vs. submission |
| 20 | `feel_intensity` | Dimensional | Overall emotional magnitude regardless of type |
| 21 | `feel_coherence_tension` | Cognitive | Degree of conflict with existing beliefs/memories |

### Layer 2: Functional Signals (10)

Scored independently by Haiku (not derived from Layer 1). Stored as individual Weaviate properties with `functional_` prefix, 0-1 floats.

| # | Property | Biological Analog | Function |
|---|----------|-------------------|----------|
| 1 | `functional_salience` | Fear / Surprise | How unexpected or novel was this? (prediction error) |
| 2 | `functional_urgency` | Anger / Fear | How time-sensitive is the relevance? (decay rate) |
| 3 | `functional_social_weight` | Trust / Disgust | How much did this affect relationships/reputation? |
| 4 | `functional_agency` | Pride / Shame | Was this caused by the bot's own actions? |
| 5 | `functional_novelty` | — | How unique is this relative to the collection? |
| 6 | `functional_retrieval_utility` | — | How likely is this memory to be useful in future queries? |
| 7 | `functional_narrative_importance` | — | Does this memory advance or anchor a personal story arc? |
| 8 | `functional_aesthetic_quality` | — | Beauty, craft, artistry of the content |

Note: `valence` and `coherence_tension` appear in both layers (scored independently in each context). Layer 2 total is 8 unique signals + 2 shared with Layer 1 = 10 functional signal properties, 31 total unique Weaviate properties across both layers.

### Composite Scores (3)

Three composite scores computed and stored as Weaviate properties:

| Property | Inputs | Purpose |
|----------|--------|---------|
| `feel_significance` | Weighted sum of Layer 1 discrete emotions | Emotional intensity composite |
| `functional_significance` | Weighted sum of Layer 2 functional signals | Functional importance composite |
| `total_significance` | `feel_significance` + `functional_significance` | Combined significance for sorting |

Composite weights are initially set by the creating LLM at memory creation time. REM re-computes them during scoring cycles.

### Memory Observation Field

A new `observation` property on Memory objects:

| Property | Type | Purpose |
|----------|------|---------|
| `observation` | TEXT | LLM-generated summary/insight about the memory |

- **At creation**: The creating LLM generates an initial observation (a concise summary or insight about the memory's content)
- **During REM**: Haiku updates the observation with deeper context — incorporating relationship connections, emotional patterns, and longitudinal significance
- **Used as context**: The observation is passed to Haiku during emotional scoring of related memories, providing richer context than raw content alone

### REM Metadata

Additional tracking properties on memories:

| Property | Type | Purpose |
|----------|------|---------|
| `rem_touched_at` | ISO timestamp | Last time REM updated this memory's scores |
| `rem_visits` | integer | How many times REM has accessed/scored this memory |

---

## Implementation

### Scoring Architecture

**Per-dimension scoring**: Each of the 31 dimensions is scored by a separate Haiku call for maximum accuracy. Cost: ~$0.75 per 500 memories.

**Scoring happens during REM cycles** with a configurable batch size per cycle for backfill of existing collections. Each call includes:
- Memory content text
- Memory metadata (`content_type`, `created_at` — not tags)
- Relationship `observation` texts (context from connected memories)
- Nearest-neighbor emotional scores (3-5 most similar memories by embedding)
- Collection-level emotional averages (computed once per REM cycle, cached)
- Emotional definitions/rubrics for the dimension being scored

**Create-time defaults**: All 31 `feel_*` / `functional_*` fields are optional inputs on the `create_memory` schema. The creating LLM can provide sane defaults. REM always re-scores during its cycle regardless of whether defaults were provided.

**Longitudinal context**: A rolling emotional profile summary per user is planned in remember-mcp (`core-mood-memory.md`). When available, this will be passed to Haiku as additional calibration context.

**Cost cap**: Emotional scoring has its own budget cap, separate from clarification-17's $50/cycle cap for relationship/curation scoring.

### Enhanced REM Cycle

During "sleep" (offline consolidation), REM executes phases:

0. **Score** — Score unscored/outdated memories on all 31 dimensions (configurable batch size)
1. **Replay** — Revisit recent memories weighted by salience
2. **Reweight** — Adjust significance based on what happened after the memory (outcome feedback)
3. **Abstract** — Promote recurring patterns from episodic to semantic memory
4. **Prune** — Increase decay property on low-significance memories, ultimately soft-delete
5. **Reconcile** — Flag and resolve high coherence-tension memories (belief updating)

REM cycle is being restructured to use the remember-core jobs pattern, allowing phases to be split into steps.

### Retroactive Reweighting

Three triggers for re-evaluating a memory's scores:

1. **REM cycle re-evaluation** (periodic): Each cycle re-evaluates recent memories in light of newer context
2. **New relationship formation** (event-driven): When REM forms a new relationship involving the memory, trigger re-scoring
3. **Retrieval count threshold** (usage-driven): When a memory's retrieval count crosses a threshold, re-evaluate

**Selective re-scoring**: A sub-LLM call determines which dimensions the new information impacts, returning an array of dimensions to re-evaluate. Only those dimensions are re-scored (e.g., new relationship context changes `salience` and `emotional_significance` but not `humor`).

### Abstraction (Episodic → Semantic Promotion)

REM can automatically create abstract/synthesized memories from detected patterns:

- **Content type**: `rem` — distinguishes REM-generated memories from user-created ones
- **Search exclusion**: Excluded from searches by default (opt-in via filter)
- **Relationships**: Abstract memories link back to source episodic memories via relationships
- **Notifications**: Silent creation (no user notification), but visible in a "rem" tab in the memories feed (similar to the existing "agent" tab)
- **Examples**:
  - 12 Monday anxiety memories → *"Recurring pattern: pre-meeting anxiety that resolves after the meeting"*
  - 30 autumn haiku → *"Collection exploring themes of impermanence and letting go"*
  - Vegetarian journey → *"Vegetarian identity: committed since [date], values-based motivation"*

### Pruning

Pruning follows a graduated approach:
1. Increase `decay` property on low-significance memories over successive REM cycles
2. Once decay crosses a threshold, soft-delete (mark as archived, hide from search but recoverable)

### Trust-Level Flagging

REM flags memories where emotional scores suggest the trust level may be inappropriate:

- Flag stored in Firestore classifications table with `trust_level_concern` type
- Includes human-readable reason: *"This memory discusses childhood trauma — did you mean to make this public, or would you like to change the trust level?"*
- User can dismiss flags; dismissed flags are tracked to prevent re-flagging for the same issue

### Signal Semantics

- **Valence** uses absolute value for composite scoring but preserves sign for retrieval — traumatic and joyful memories are both strong, but color future decisions differently
- **Coherence tension** resists pruning until resolved — the "this doesn't fit" signal drives learning
- **Agency** matters because memories of your own actions are more useful for future planning than observations
- **Retrieval count** creates a natural rich-get-richer dynamic (like biological memory reconsolidation)
- **Urgency** should decay — something urgent last week probably isn't urgent now, but salience might persist

### Sort Mode

A generic `byProperty` sort mode allows sorting by any Weaviate property:

```typescript
// Sort by any property — pure sort, no search
{
  sort_mode: 'byProperty',
  sort_field: 'feel_trauma',        // any feel_* / functional_* or other property
  sort_direction: 'desc',           // 'asc' | 'desc'
  limit: 20,
  offset: 0
}

// Example: most emotionally significant memories
{ sort_mode: 'byProperty', sort_field: 'total_significance', sort_direction: 'desc' }

// Example: highest coherence tension (conflicting beliefs)
{ sort_mode: 'byProperty', sort_field: 'feel_coherence_tension', sort_direction: 'desc' }
```

---

## Privacy

- **Visibility**: Internal scoring only — emotional scores are never exposed via API or UI
- **Exports**: Emotional scores are not included in memory exports (data portability)
- **Ghost mode**: Emotional scores are never visible when viewing another user's memories as a ghost
- **Trust flagging**: REM can flag trust-level concerns based on emotional scores, but this is a suggestion to the user, not an automatic action

---

## Benefits

- **Principled pruning**: Low-significance memories can be decayed and soft-deleted, keeping the memory graph lean
- **Retroactive reweighting**: Memories gain or lose significance based on later context — a boring fact becomes critical when it explains a later event
- **Pattern extraction**: "This has happened 5 times" becomes a rule via abstraction, with individual episodes deprioritized
- **Interference resolution**: Contradictory memories get surfaced and reconciled rather than silently coexisting
- **Biologically inspired**: Maps well-understood emotional functions to computational equivalents without anthropomorphizing
- **Maximum accuracy**: Per-dimension scoring ensures each emotional signal gets dedicated evaluation
- **Privacy-first**: Emotional metadata is never exposed externally

---

## Trade-offs

- **LLM cost**: 31 separate Haiku calls per memory (~$0.75/500 memories). Mitigated by configurable batch size and successive-cycle backfill.
- **Schema weight**: 31 dimensions + 3 composites + 2 REM metadata + 1 observation = 37 new Weaviate properties per memory. Heavy schema migration.
- **Subjectivity of signals**: Different LLM calls may score differently. Mitigated by re-scoring during REM cycles and sub-LLM selective re-evaluation.
- **Scope**: Full 5-phase REM cycle is ambitious. Implement incrementally (scoring first, then replay/reweight, then abstract/prune/reconcile).
- **Abstraction risk**: Auto-generated memories could be wrong or unwanted. Mitigated by `content_type: 'rem'`, search exclusion by default, and dedicated UI tab.

---

## Dependencies

- **REM background service** (M10, complete): Existing clustering and Haiku validation infrastructure
- **Jobs system** (M16, complete): REM cycle restructuring into stepped jobs
- **Weaviate schema**: 36 new properties on Memory type
- **Haiku API**: Per-dimension scoring calls
- **Firestore**: Classification/flagging table, REM cycle state
- **remember-mcp core-mood-memory** (planned): Longitudinal emotional profile summary

---

## Testing Strategy

- **Unit tests**: Composite score computation, signal normalization, decay functions, selective re-evaluation dimension selection
- **Scoring consistency**: Same memory scored multiple times should produce similar signals (within tolerance)
- **Pruning tests**: Verify decay progression and soft-delete threshold
- **Abstraction tests**: Verify REM-generated memories have correct content_type, relationships, and search exclusion
- **Trust flagging tests**: Verify flag creation, dismissal tracking, no re-flagging
- **Integration tests**: Full REM cycle with scoring, reweighting, abstraction, and pruning on test collection
- **Cost tests**: Verify batch size limits and budget cap enforcement

---

## Migration Path

1. Add 37 new properties to Memory type in Weaviate schema (default all to 0/null) — 31 dimensions + 3 composites + 2 REM metadata + 1 observation
2. Add `feel_*` / `functional_*` / `observation` optional fields to `create_memory` input schema
3. Implement per-dimension Haiku scoring with rubrics
4. Implement context gathering (relationship observations, nearest neighbors, collection stats)
5. Wire scoring into REM cycle as Phase 0 with configurable batch size
6. Implement composite score computation (`feel_significance`, `functional_significance`, `total_significance`)
7. Implement `byProperty` sort mode
8. Implement retroactive reweighting triggers (relationship formation, retrieval threshold)
9. Implement selective re-evaluation (sub-LLM dimension selection)
10. Implement abstraction (content_type: 'rem', search exclusion, relationship linking)
11. Implement pruning (decay progression, soft-delete)
12. Implement trust-level flagging (Firestore classifications, dismissal tracking)
13. Implement reconciliation phase (coherence tension resolution)

---

## Key Design Decisions (Clarifications 18-19)

### Dimensions & Storage

| Decision | Choice | Rationale |
|---|---|---|
| Total dimensions | 31 (21 discrete + 10 functional) | Track everything, decide what's useful later |
| Layer relationship | Independent — not computed from each other | Each layer scored separately by Haiku for maximum accuracy |
| Storage | All in Weaviate as individual properties | Queryable and sortable at query time |
| Scale | 0-1 float (valence: -1 to 1) | Continuous scale for fine-grained scoring |
| Property prefix | `feel_` for emotions, `functional_` for signals | Distinguishes the two independent layers |
| Composite scores | Three: `feel_significance`, `functional_significance`, `total_significance` | Separate emotional and functional rankings, plus combined |

### Scoring

| Decision | Choice | Rationale |
|---|---|---|
| Scoring approach | Per-dimension (31 separate Haiku calls) | Maximum accuracy per dimension |
| Create-time defaults | Optional `feel_*` / `functional_*` fields on create_memory input | LLM can provide sane defaults at creation |
| REM re-scoring | Always re-scores, even with create-time defaults | REM scoring is authoritative |
| Re-evaluation triggers | REM cycle + new relationships + retrieval threshold | All three for comprehensive coverage |
| Selective re-eval | Sub-LLM picks which dimensions to re-score | Avoids unnecessary re-scoring of stable dimensions |
| Scoring context | Content + metadata (content_type, created_at) + relationship observations + nearest neighbors + collection stats | Rich context for accurate scoring |
| Rubrics | Yes, include emotional definitions per dimension | Consistent scoring across calls |
| Cost cap | Own cap, separate from clar-17 | Independent budget for emotional scoring |
| Batch size | Configurable per REM cycle | Enables backfill of existing collections |

### REM Cycle

| Decision | Choice | Rationale |
|---|---|---|
| Scoring phase | New Phase 0 in REM job | Scores before relationship discovery |
| Abstraction | Yes, creates content_type: 'rem' memories | Excluded from search by default, visible in "rem" tab |
| Pruning | Increase decay → soft-delete | Graduated, recoverable approach |
| Trust flagging | Flag in Firestore classifications, user-dismissable | Suggestions, not automatic actions |
| REM tracking | `rem_touched_at` + `rem_visits` per memory | Track REM engagement for future optimization |

### Privacy

| Decision | Choice | Rationale |
|---|---|---|
| API visibility | Internal only — never exposed | Emotional metadata is sensitive |
| Exports | Not included | Privacy protection |
| Ghost mode | Never visible | Emotional analysis of others' memories is inappropriate |
| Weight tuning | LLM at create, REM re-weights | No user-configurable weights needed |
| Sort mode | Generic `byProperty` | Allows sorting by any property without dedicated emotional sort mode |

---

## Future Considerations

- **Multi-modal salience**: Incorporate image/document content into salience scoring (not just text embeddings)
- **Adaptive weights**: Learn composite weights per user based on interaction patterns
- **Semantic memory tier**: Separate storage for abstracted rules (promoted from episodic memories)
- **Coherence graph**: Explicit tracking of which memories conflict with each other
- **Dream mode**: Extended REM cycles during low-activity periods for deeper consolidation
- **Longitudinal context via core-mood-memory**: Rolling emotional profile summary from remember-mcp
- **Multi-centroid emotional clustering**: Group memories by emotional signature, not just semantic similarity

---

**Status**: Design Specification
**Recommendation**: Begin with Weaviate schema migration (36 properties) and per-dimension scoring infrastructure. Wire into REM cycle as Phase 0 before implementing abstraction/pruning/reconciliation.
**Related Documents**:
- `agent/design/local.rem-background-relationships.md` (existing REM design)
- `agent/milestones/milestone-10-rem-background-relationships.md` (REM implementation)
- `agent/clarifications/clarification-18-rem-emotional-weighting.md`
- `agent/clarifications/clarification-19-rem-emotional-weighting-followup.md`
- `agent/drafts/rem.md` (original ideation notes)
