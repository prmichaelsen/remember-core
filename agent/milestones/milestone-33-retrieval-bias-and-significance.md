# Milestone 33: Retrieval Bias & Significance Scoring

**Goal**: Wire the core mood state into memory retrieval (mood-biased reranking) and new memory creation (mood-aware significance scoring). Add anticipatory emotion processing to the REM cycle.

**Status**: Not Started
**Estimated Duration**: 1 week
**Dependencies**: M32 (Core Mood State)

---

## Overview

The mood memory biases all memory retrieval — low confidence boosts failure/lesson memories, low coherence boosts contradiction memories, negative valence slightly boosts positive memories (self-correction), low trust suppresses high-trust memories and boosts betrayal memories. New memories receive mood-aware initial significance scores. The REM cycle generates forward predictions (anticipatory emotion) creating pressure entries.

Design doc: `agent/design/core-mood-memory.md`

---

## Deliverables

1. `applyMoodBias()` — mood-biased reranking in MemoryService search pipeline
2. `calculateMemorySignificance()` — mood-aware weight for new memories
3. Anticipatory emotion in REM cycle (pattern detection, forward projection, pressure creation)
4. Unit tests

---

## Tasks

- Task 168: Mood-biased retrieval reranking
- Task 169: Mood-aware significance scoring + anticipatory emotion
- Task 170: Unit tests
