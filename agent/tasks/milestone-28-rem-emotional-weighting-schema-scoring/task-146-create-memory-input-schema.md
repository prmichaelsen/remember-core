# Task 146: Create-Memory Input Schema

**Milestone**: [M28 - REM Emotional Weighting — Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 2 hours
**Dependencies**: Task 145
**Status**: Not Started

---

## Objective

Add feel_*, functional_*, and observation as optional fields on the create_memory input so that the creating LLM can provide sane defaults at creation time.

---

## Context

When an LLM creates a memory, it often has enough context to provide reasonable initial emotional/functional scores. Making these fields optional on the create input allows the creating LLM to seed values that REM will later refine. All fields are optional — memories created without them will have null values until REM scores them.

---

## Steps

### 1. Update CreateMemoryInput Type
Add all 31 dimension fields (feel_* and functional_*) plus observation as optional properties on the CreateMemoryInput type. Include validation for value ranges (0-1 for most, -1 to 1 for valence).

### 2. Update MemoryService.create
Pass through the new optional fields when creating a memory in Weaviate. If composite fields (feel_significance, functional_significance, total_significance) are not provided, compute them from the provided dimension values.

### 3. Update OpenAPI Spec
Add the new optional fields to the create memory request schema in the OpenAPI specification.

---

## Verification

- [ ] CreateMemoryInput type includes all 31 dimension fields + observation as optional
- [ ] Creating a memory with feel_*/functional_* values persists them correctly
- [ ] Creating a memory without the new fields works as before (null defaults)
- [ ] Value range validation rejects out-of-range values (e.g., feel_joy: 1.5)
- [ ] feel_valence accepts -1 to 1 range
- [ ] OpenAPI spec updated with new optional fields
- [ ] Tests pass

---

## Expected Output

Memories can be created with optional emotional/functional dimension scores and observation text. The create API accepts and persists these values when provided, and defaults to null when omitted.

---

**Next Task**: [task-147-per-dimension-haiku-scoring.md](./task-147-per-dimension-haiku-scoring.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
