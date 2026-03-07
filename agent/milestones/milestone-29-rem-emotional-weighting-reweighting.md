# Milestone 29: REM Emotional Weighting — Retroactive Reweighting

**Goal**: Implement retroactive reweighting — three triggers that re-evaluate memory emotional scores based on new context, plus selective re-evaluation to minimize LLM calls.

**Status**: Not Started
**Estimated Duration**: 1.5 weeks
**Dependencies**: M28 (REM Emotional Weighting — Schema & Scoring)

---

## Overview

Memories that seemed boring at creation may become critical after later context. A passing mention of someone's name scores low salience initially, but after dozens of related memories accumulate, that name becomes significant. A recipe scores low emotional significance until it gets clustered with grief-related memories. A tax deadline scores low urgency until the user keeps searching for it.

This milestone adds three triggers for re-scoring (periodic REM cycle, relationship formation, retrieval threshold) and a sub-LLM mechanism to determine which of the 31 dimensions actually need re-evaluation, avoiding unnecessary scoring calls.

Design doc: `agent/design/local.rem-emotional-weighting.md`
Clarifications: 18, 19

---

## Deliverables

1. REM cycle re-evaluation trigger for recent/updated memories
2. Relationship formation trigger for re-scoring when new relationships involve a memory
3. Retrieval count threshold trigger for re-scoring frequently accessed memories
4. Selective re-evaluation via sub-LLM dimension impact analysis

---

## Key Decisions (Clarifications 18-19)

- All three trigger types implemented: periodic (REM cycle), event-driven (relationship formation), usage-driven (retrieval threshold)
- Selective re-scoring via sub-LLM: ask which dimensions are impacted by new context before re-scoring
- Re-score all 31 dimensions only when sub-LLM indicates they are impacted
- Composites updated after any re-scoring pass

---

## Success Criteria

- [ ] REM cycle trigger identifies and re-evaluates memories created or updated since last REM touch
- [ ] Relationship formation trigger fires when new relationships involve a memory, re-scoring both source and target
- [ ] Retrieval threshold trigger fires when a memory's retrieval count crosses configured threshold
- [ ] Selective re-evaluation reduces unnecessary scoring calls by only re-scoring impacted dimensions
- [ ] Composite scores updated correctly after partial re-scoring
- [ ] All three triggers integrate cleanly with existing REM cycle infrastructure
- [ ] All unit tests pass

---

## Tasks

- Task 153: REM cycle re-evaluation trigger
- Task 154: Relationship formation trigger
- Task 155: Retrieval count threshold trigger
- Task 156: Selective re-evaluation via sub-LLM dimension impact analysis
