# Task 157: Abstraction — Episodic to Semantic Memory Promotion

**Milestone**: [M30 - REM Emotional Weighting — Abstraction, Pruning & Reconciliation](../milestones/milestone-30-rem-emotional-weighting-abstraction-pruning.md)
**Estimated Time**: 5 hours
**Dependencies**: M29 (Tasks 153-156)
**Status**: Not Started

---

## Objective

Implement REM abstraction — detect patterns in episodic memories and create synthesized semantic memories with content_type 'rem', linked back to source memories via relationships.

---

## Context

When a user accumulates many episodic memories around a theme, REM should detect the pattern and create a synthesized semantic memory. These abstract memories use content_type 'rem' to distinguish them from user-created memories, are excluded from search by default (opt-in via filter), created silently (no user notification), and visible in a dedicated "rem" tab.

Examples:
- 12 Monday anxiety memories -> pattern summary about recurring Monday anxiety
- 30 autumn haiku -> thematic summary of seasonal poetry practice
- Vegetarian journey memories -> identity synthesis about dietary evolution

---

## Steps

### 1. Implement Pattern Detection
Build cluster analysis on similar memories using vector similarity and emotional score patterns. Identify groups of episodic memories that share thematic or emotional patterns above a configurable threshold.

### 2. Implement Abstract Memory Creation
Create synthesized memories with content_type 'rem'. Generate summary content that captures the pattern across source memories. Ensure these memories are created silently without user notification.

### 3. Create Relationships to Source Memories
Link each abstract REM memory back to the episodic memories it was synthesized from using the relationships system. This preserves provenance and allows users to trace abstractions to their sources.

### 4. Add Search Exclusion Filter
Ensure content_type 'rem' memories are excluded from standard search results by default. Add an opt-in filter parameter to include them when explicitly requested (e.g., via "rem" tab).

### 5. Write Tests
Test pattern detection accuracy, abstract memory creation with correct content_type, relationship creation to source memories, and search exclusion/inclusion behavior.

---

## Verification

- [ ] Pattern detection identifies clusters of thematically similar episodic memories
- [ ] Abstract memories created with content_type 'rem'
- [ ] Relationships link abstract memories to their source episodic memories
- [ ] Standard search excludes content_type 'rem' memories by default
- [ ] Opt-in filter allows retrieval of REM memories
- [ ] Abstract memory content accurately summarizes source patterns
- [ ] All tests pass

---

## Expected Output

- Pattern detection module for clustering similar episodic memories
- Abstract memory creation logic with content_type 'rem'
- Relationship entries linking REM memories to source memories
- Updated search filters to exclude/include REM content type
- Colocated test file(s) with `.spec.ts` suffix
