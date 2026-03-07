# Milestone 28: REM Emotional Weighting — Schema & Scoring

**Goal**: Add 37 new Weaviate properties for emotional weighting (31 dimensions + 3 composites + 2 REM metadata + 1 observation), implement per-dimension Haiku scoring with context gathering, wire into REM cycle, and add byProperty sort mode.

**Status**: Not Started
**Estimated Duration**: 3 weeks
**Dependencies**: M10 (REM Background Relationships, complete), M16 (Job Tracking System, complete)

---

## Overview

Foundation milestone for REM emotional weighting. Adds schema properties for 31 emotional/functional dimensions, implements per-dimension Haiku scoring with rubric-driven prompts and context gathering (relationship observations, nearest-neighbor scores, collection averages), wires scoring into the REM cycle as Phase 0, computes composite significance scores, and introduces a generic byProperty sort mode for querying by any Weaviate property.

Design doc: `agent/design/local.rem-emotional-weighting.md`
Clarifications: 18, 19

---

## Deliverables

1. Weaviate schema migration with 37 new properties (21 feel_*, 8 functional_*, 3 composites, 2 REM metadata, 1 observation)
2. Create-memory input schema updated with optional feel_*/functional_*/observation fields
3. Per-dimension Haiku scoring service with rubric definitions for all 31 dimensions
4. Context gathering for scoring calls (relationship observations, nearest-neighbor scores, collection averages)
5. REM cycle Phase 0 integration with configurable batch size and own cost cap
6. Composite score computation (feel_significance, functional_significance, total_significance)
7. REM metadata tracking (rem_touched_at, rem_visits)
8. Generic byProperty sort mode for any Weaviate property

---

## Key Decisions (Clarifications 18-19)

- All 31 dimensions stored directly in Weaviate (no separate collection)
- Per-dimension scoring: 31 individual Haiku calls per memory, each with its own rubric
- `feel_` prefix for discrete emotions (21 dimensions), `functional_` prefix for functional signals (8 dimensions)
- 0-1 float scale for all dimensions; feel_valence uses -1 to 1
- Own cost cap for emotional scoring, separate from relationship/curation scoring
- Configurable batch size per REM cycle for backfill processing
- `byProperty` sort mode: pure sort on any Weaviate property, no vector search
- Initial weights set by creating LLM, REM re-computes during scoring

---

## Success Criteria

- [ ] Schema migration adds all 37 properties without breaking existing memories
- [ ] Creating a memory with feel_*/functional_*/observation fields persists values correctly
- [ ] Per-dimension Haiku scoring produces valid 0-1 floats (valence: -1 to 1)
- [ ] Context gathering assembles relationship observations, nearest-neighbor scores, and collection averages
- [ ] REM Phase 0 processes unscored memories first, then outdated ones
- [ ] REM Phase 0 respects its own cost cap and configurable batch size
- [ ] Composite scores (feel_significance, functional_significance, total_significance) computed correctly
- [ ] rem_touched_at and rem_visits updated on each scored memory
- [ ] `sort_mode: 'byProperty'` accepted with sort_field and sort_direction parameters
- [ ] byProperty works with any Weaviate property (feel_*, functional_*, total_significance, etc.)
- [ ] All unit tests pass
- [ ] Existing tests unaffected

---

## Tasks

- Task 145: Weaviate schema migration
- Task 146: Create-memory input schema
- Task 147: Per-dimension Haiku scoring
- Task 148: Scoring context gathering
- Task 149: REM cycle Phase 0 scoring
- Task 150: Composite score computation
- Task 151: REM metadata tracking
- Task 152: byProperty sort mode
