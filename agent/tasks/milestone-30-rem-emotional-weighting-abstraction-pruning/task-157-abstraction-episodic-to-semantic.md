# Task 157: Abstraction — Episodic to Semantic Memory Promotion

**Milestone**: [M30 - REM Emotional Weighting — Abstraction, Pruning & Reconciliation](../milestones/milestone-30-rem-emotional-weighting-abstraction-pruning.md)
**Estimated Time**: 5 hours
**Dependencies**: M29 (Tasks 153-156 — scoring infrastructure must exist)
**Status**: Not Started
**REM Phase**: Phase 3 (Abstract)

---

## Key Design Decisions

| Decision | Choice | Source |
|---|---|---|
| Content type for REM-generated memories | `rem` — new content_type added to `ContentType` union and `CONTENT_TYPES` array | Clarification 19 |
| Search visibility | Excluded from searches by default; opt-in via `content_type: 'rem'` filter | Clarification 19 |
| Provenance tracking | Linked back to source episodic memories via relationships (relationship_type: `'abstraction'`) | Clarification 19 |
| User notification | Silent creation — no push notification or feed highlight | Clarification 19 |
| UI visibility | Visible in a dedicated "rem" tab in the memories feed (same pattern as existing "agent" tab) | Clarification 19 |
| LLM for synthesis | Haiku generates the abstraction text | Clarification 19 |
| Phase placement | REM Phase 3 (Abstract) — runs after Score (0), Replay (1), Reweight (2) | Design doc |
| Pattern detection input | Clusters from existing REM clustering + emotional score similarity — use agent judgement for pattern detection algorithms (no prescribed algorithm) | Design doc |
| Trust score for abstractions | `trust_score: 5` (Secret) — synthetic memories may contain sensitive observations | Clarification 20 |
| Shared constants | Shared REM constants live in `src/services/rem.constants.ts` | Clarification 20 |

---

## Concrete Examples

| Source Memories | Abstracted REM Memory |
|---|---|
| 12 Monday anxiety memories | "Recurring pattern: pre-meeting anxiety that resolves after the meeting" |
| 30 autumn haiku | "Collection exploring themes of impermanence and letting go" |
| Multiple vegetarian-related memories over time | "Vegetarian identity: committed since [date], values-based motivation" |

---

## Objective

Implement REM Phase 3 (Abstract) — detect recurring patterns in episodic memories and create synthesized semantic memories with `content_type: 'rem'`. These memories are linked back to their source episodic memories via relationships, excluded from default search, and visible only in a dedicated "rem" tab.

---

## Implementation Steps

### 1. Register `rem` Content Type

**Files**: `src/constants/content-types.ts`, `src/types/memory.types.ts`

- Add `'rem'` to the `CONTENT_TYPES` array in the System category (alongside `agent`)
- Add `CONTENT_TYPE_METADATA` entry:
  ```
  rem: {
    name: 'rem',
    category: 'system',
    description: 'REM-generated semantic memory — synthesized pattern from episodic memories',
    examples: [
      'Recurring pattern: pre-meeting anxiety that resolves after the meeting',
      'Collection exploring themes of impermanence and letting go',
      'Vegetarian identity: committed since 2024, values-based motivation',
    ],
    common_fields: ['source_memory_count', 'abstraction_type'],
  }
  ```
- Add `'rem'` to `CONTENT_TYPE_CATEGORIES.system` array
- Ensure `ContentType` union type in `memory.types.ts` includes `'rem'` (it should if derived from the array)

### 2. Add Default Search Exclusion for `rem` Content Type

**Files**: `src/services/memory.service.ts`

- In all search/list methods that already exclude `ghost` and `comment` content types, add an equivalent exclusion for `rem`:
  ```typescript
  filters.push(this.collection.filter.byProperty('content_type').notEqual('rem'));
  ```
- This filter should be skipped when the caller explicitly requests `content_type: 'rem'` (opt-in)
- Follow the same pattern used for `ghost` exclusion — the `ghostFilters` pattern already shows how to conditionally exclude content types

### 3. Implement Pattern Detection for Abstraction

**File**: `src/services/rem.abstraction.ts` (new)

- **Input**: All memories in a collection with their emotional scores and existing relationships
- **Detection strategy** (use agent judgement — no prescribed algorithm required):
  1. Query for relationship clusters with 5+ members that share thematic similarity (reuse existing REM clustering output)
  2. Group memories by high emotional score similarity (e.g., multiple memories with high `feel_fear` + matching `functional_narrative_importance`)
  3. Check if a cluster has already been abstracted (query for existing `rem` memories linked to the same source IDs) — skip if so
- **Configurable thresholds**:
  - `min_cluster_size_for_abstraction`: minimum episodic memories to trigger abstraction (default: 5)
  - `abstraction_similarity_threshold`: minimum average similarity within cluster (default: 0.8)
- **Output**: Array of `AbstractionCandidate` objects: `{ source_memory_ids: string[], source_contents: string[], emotional_summary: object }`

### 4. Implement Haiku Synthesis Call

**File**: `src/services/rem.abstraction.ts`

- For each `AbstractionCandidate`, call Haiku with:
  - Source memory contents (truncated if needed)
  - Emotional score summary across the cluster
  - Instruction to generate a concise synthesis (1-3 sentences) capturing the recurring pattern, theme, or identity evolution
  - Instruction to include temporal references where relevant (e.g., "since [earliest date]")
- **Prompt template** should request:
  - A title-like summary sentence
  - A brief observation about what the pattern reveals
  - Whether this represents a recurring event, thematic collection, or identity/value synthesis
- **Output**: `{ content: string, observation: string, abstraction_type: 'recurring_pattern' | 'thematic_collection' | 'identity_synthesis' }`

### 5. Create Abstract REM Memories

**File**: `src/services/rem.abstraction.ts`

- Create the memory via `MemoryService.create()` with:
  - `content_type: 'rem'`
  - `content`: Haiku-generated synthesis text
  - `observation`: Haiku-generated observation
  - `tags`: `['rem-abstraction', abstraction_type]`
  - `source: 'rem'`
  - `trust_score: 5` (Secret) — abstracted memories are synthetic and may contain sensitive observations; do NOT inherit from source majority
  - Set `rem_touched_at` to current timestamp
  - Set `rem_visits` to 1

### 6. Create Relationships to Source Memories

**File**: `src/services/rem.abstraction.ts`

- For each abstract memory, create a relationship linking it to all source episodic memories:
  - `relationship_type: 'abstraction'` (new relationship type — add to valid types if needed)
  - `observation`: "Semantic abstraction of [N] episodic memories about [theme]"
  - `source: 'rem'`
  - `memory_ids`: `[abstract_memory_id, ...source_memory_ids]`
- This allows traversing from abstract back to source and vice versa

### 7. Wire into REM Cycle as Phase 3

**Files**: `src/services/rem.service.ts`, `src/services/rem-job.worker.ts`

- Add Phase 3 (Abstract) to `RemService.runCycle()` after the existing relationship CRUD phase
- Add a new step to `REM_STEPS`:
  ```typescript
  { id: 'abstraction', label: 'Abstracting episodic patterns to semantic memories' }
  ```
- Call `runAbstractionPhase(collectionId)` which:
  1. Detects pattern candidates
  2. Filters out already-abstracted clusters
  3. Generates synthesis via Haiku
  4. Creates `rem` memories and relationships
- Track stats: `abstractions_created: number` in `RunCycleResult`

### 8. Write Tests

**File**: `src/services/rem.abstraction.spec.ts`

Tests to implement:

- **Pattern detection**: Given N similar memories, detects a valid abstraction candidate
- **Already-abstracted skip**: If a cluster already has a linked `rem` memory, skip re-abstraction
- **Haiku synthesis**: Mock Haiku returns appropriate synthesis text for different cluster types
- **Memory creation**: Created memory has `content_type: 'rem'`, correct tags, `trust_score: 5`
- **Relationship creation**: Relationship links abstract memory to all source memories with type `'abstraction'`
- **Search exclusion**: Default search excludes `rem` memories; explicit filter includes them
- **Below-threshold skip**: Clusters smaller than `min_cluster_size_for_abstraction` are skipped
- **Phase integration**: Abstract phase runs after relationship CRUD in the REM cycle

---

## Verification Checklist

- [ ] `'rem'` added to `CONTENT_TYPES` and `CONTENT_TYPE_METADATA`
- [ ] Pattern detection identifies clusters of 5+ thematically similar episodic memories
- [ ] Already-abstracted clusters are detected and skipped
- [ ] Haiku generates concise synthesis text for each cluster
- [ ] Abstract memories created with `content_type: 'rem'`
- [ ] Abstract memories have `observation` field populated
- [ ] Relationships link abstract memories to source episodic memories with type `'abstraction'`
- [ ] Standard search excludes `content_type: 'rem'` memories by default
- [ ] Opt-in filter `content_type: 'rem'` allows retrieval of REM memories
- [ ] `trust_score: 5` (Secret) set on all abstracted memories — NOT inherited from source
- [ ] `rem_touched_at` and `rem_visits` set on created memories
- [ ] Phase 3 (Abstract) wired into REM cycle after relationship CRUD
- [ ] `abstractions_created` tracked in `RunCycleResult`
- [ ] All tests pass — colocated at `src/services/rem.abstraction.spec.ts`

---

## Expected Output

- `src/services/rem.abstraction.ts` — pattern detection, Haiku synthesis, memory creation, relationship linking
- `src/services/rem.abstraction.spec.ts` — colocated tests
- Updated `src/constants/content-types.ts` — `'rem'` content type
- Updated `src/services/memory.service.ts` — default search exclusion for `rem`
- Updated `src/services/rem.service.ts` — Phase 3 integration
- Updated `src/services/rem-job.worker.ts` — new `abstraction` step
