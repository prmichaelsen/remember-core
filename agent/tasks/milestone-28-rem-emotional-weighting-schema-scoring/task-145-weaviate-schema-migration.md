# Task 145: Weaviate Schema Migration

**Milestone**: [M28 - REM Emotional Weighting — Schema & Scoring](../milestones/milestone-28-rem-emotional-weighting-schema-scoring.md)
**Estimated Time**: 3 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add 37 new properties to the Memory class in Weaviate schema to support emotional weighting dimensions, composite scores, REM metadata, and observation text.

---

## Context

REM emotional weighting requires storing 31 scored dimensions (21 discrete emotions + 8 functional signals + valence + arousal), 3 composite significance scores, 2 REM tracking fields, and 1 observation text field directly on each memory in Weaviate. All new properties must default to null/0 so existing memories remain unaffected.

**Properties to add:**

- **21 feel_* properties** (0-1 float): feel_joy, feel_sadness, feel_anger, feel_fear, feel_surprise, feel_disgust, feel_trust, feel_anticipation, feel_love, feel_guilt, feel_shame, feel_pride, feel_envy, feel_gratitude, feel_hope, feel_anxiety, feel_nostalgia, feel_awe, feel_contempt, feel_curiosity, feel_loneliness
- **feel_valence** (-1 to 1 float): overall positive/negative emotional tone
- **8 functional_* properties** (0-1 float): functional_urgency, functional_importance, functional_actionability, functional_novelty, functional_personal_relevance, functional_social_relevance, functional_temporal_sensitivity, functional_complexity
- **3 composites** (float): feel_significance, functional_significance, total_significance
- **2 REM metadata**: rem_touched_at (ISO string), rem_visits (int, default 0)
- **1 observation** (text): free-text observation field

---

## Steps

### 1. Update Schema Definition
Add all 37 properties to the Memory class schema definition with appropriate data types (number for floats, int for rem_visits, text for rem_touched_at and observation).

### 2. Add Migration
Create a backward-compatible migration that adds the new properties to existing Weaviate collections without affecting existing data. All float properties default to null, rem_visits defaults to 0.

### 3. Test Schema Creation
Write tests verifying that the schema migration runs successfully on both fresh and existing collections, and that existing memories remain readable after migration.

---

## Verification

- [ ] All 37 properties present in Weaviate Memory class schema
- [ ] Existing memories remain readable and unaffected after migration
- [ ] Float properties accept values in their valid ranges (0-1 or -1 to 1 for valence)
- [ ] rem_visits defaults to 0 for new memories
- [ ] rem_touched_at and observation accept string/text values
- [ ] Migration is idempotent (can run multiple times safely)
- [ ] Tests pass

---

## Expected Output

Weaviate Memory class schema includes all 37 new properties. Existing memories continue to work with null/default values for the new fields. Migration can be applied to both fresh and existing environments.

---

**Next Task**: [task-146-create-memory-input-schema.md](./task-146-create-memory-input-schema.md)
**Related Design Docs**: `agent/design/local.rem-emotional-weighting.md`
