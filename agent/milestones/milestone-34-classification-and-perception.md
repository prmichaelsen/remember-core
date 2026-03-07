# Milestone 34: Memory Classification & User Perception

**Goal**: Implement REM-powered memory classification (genre, quality, thematic groups, dedup) and user perception documents (ghost's model of each user).

**Status**: Not Started
**Estimated Duration**: 1.5 weeks
**Dependencies**: M32 (Core Mood State), M10 (REM, complete)

---

## Overview

**Memory Classification**: During REM cycles, classify unclassified memories by genre/quality/thematic group using Haiku + findSimilar. Detect duplicates. Firestore at `users/{user_id}/core/classifications`.

**User Perception**: Ghost maintains a model of each user — personality sketch, communication style, emotional baseline, interests, patterns, needs. Firestore at `users/{owner_id}/core/perceptions/{target_user_id}`. Updated each REM cycle. Calibrates mood interpretation.

Design doc: `agent/design/core-mood-memory.md`

---

## Deliverables

1. ClassificationService — Firestore CRUD for classification index
2. REM classification pipeline — genre/quality/thematic scoring via Haiku + findSimilar
3. Similarity-powered deduplication detection
4. PerceptionService — Firestore CRUD for user perception documents
5. REM perception updates
6. Unit tests

---

## Tasks

- Task 171: Classification schema + ClassificationService
- Task 172: REM classification pipeline (genre/quality/thematic + dedup)
- Task 173: User perception schema + PerceptionService + REM updates
- Task 174: Unit tests
