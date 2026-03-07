# Task 147: Per-Dimension Haiku Scoring

**Milestone**: [M28 - REM Emotional Weighting — Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 6 hours
**Dependencies**: Task 145
**Status**: Not Started

---

## Objective

Implement per-dimension Haiku scoring with rubric definitions for all 31 emotional/functional dimensions. Each dimension gets its own Haiku call with a tailored rubric that defines the dimension and guides scoring.

---

## Context

Emotional weighting requires scoring each memory on 31 independent dimensions. Each dimension has a distinct definition and rubric — for example, feel_joy measures positive emotional response while functional_urgency measures time-sensitivity. Using per-dimension calls (rather than a single call scoring all dimensions) produces more accurate, calibrated results because each call focuses on one concept with a dedicated rubric.

Each call returns a 0-1 float (feel_valence returns -1 to 1). The scoring service must handle all 31 dimensions and be extensible for future additions.

---

## Steps

### 1. Create Scoring Service
Create an emotional scoring service that manages per-dimension Haiku calls. The service should accept a memory and a dimension identifier, construct the appropriate prompt with rubric, call Haiku, and parse the numeric response.

### 2. Implement Rubric Templates
Define rubric templates for each of the 31 dimensions. Each rubric should include:
- Dimension name and definition
- What a low score (0) means vs. a high score (1)
- Examples or anchoring criteria for calibration
- For feel_valence: explain the -1 to 1 scale

### 3. Implement Single-Dimension Scoring Function
Create the core function that takes a memory + dimension + context, constructs the Haiku prompt with the rubric, makes the API call, parses the numeric response, and handles errors (defaulting to null on failure).

---

## Verification

- [ ] Scoring service accepts a memory and dimension identifier
- [ ] All 31 dimensions have defined rubric templates
- [ ] Haiku calls return valid 0-1 floats (valence: -1 to 1)
- [ ] Invalid/failed responses default to null rather than crashing
- [ ] Rubric templates include dimension definition, low/high anchors
- [ ] Service is extensible for adding new dimensions
- [ ] Tests pass with mocked Haiku responses

---

## Expected Output

A scoring service that can score any memory on any of the 31 emotional/functional dimensions via individual Haiku calls with dimension-specific rubrics. Returns validated numeric scores.

---

**Next Task**: [task-148-scoring-context-gathering.md](./task-148-scoring-context-gathering.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
