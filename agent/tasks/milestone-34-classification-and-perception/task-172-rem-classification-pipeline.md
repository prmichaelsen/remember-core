# Task 172: REM Classification Pipeline

**Milestone**: M34 — Classification & User Perception
**Status**: Not Started
**Estimated Hours**: 5-7
**Dependencies**: Task 171

---

## Objective

Implement the REM classification step where the ghost acts as a librarian — reviewing unclassified or recently created memories and assigning rich classifications. Uses Haiku sub-LLM with `findSimilar` context for each memory.

## Context

- **Design doc**: `agent/design/core-mood-memory.md` — section "Memory Classification"
- Runs during REM cycle after scoring, before mood update
- Each unclassified memory gets a `remember_find_similar` call for context
- Sub-LLM evaluates memory alongside its nearest neighbors

## REM Classification Process

```yaml
REM_Classification:
  process:
    1. Pull unclassified or recently created memories
    2. For each memory, run remember_find_similar to get nearest neighbors
    3. Sub-LLM evaluates the memory alongside its similar matches:
       - Genre/format (from closed set of 18 — sub-LLM must pick from predefined list only)
       - Quality signals (multiple allowed per memory: substantive, draft, low_value, duplicate, stale)
       - Thematic groups (emergent, sub-LLM generated, `snake_case` normalization, multiple per memory)
       - Duplicate detection (exact content match — flagged as quality: 'duplicate')
       - Merge candidates (near duplicates — similar but not identical, stored in classifications Firestore collection)
    4. Write classifications back via ClassificationService
    5. Update Firestore classification index
```

## Genres (closed set, 18 values — sub-LLM must pick from this list only)

`short_story`, `standup_bit`, `poem`, `essay`, `technical_note`, `recipe`, `journal_entry`, `brainstorm`, `conversation_summary`, `code_snippet`, `list`, `letter`, `review`, `tutorial`, `rant`, `dream_log`, `song_lyrics`, `other`

## Quality Signals (5 values)

- `substantive` — real content with value
- `draft` — work in progress, may have value later
- `low_value` — test data, throwaway notes, "asdf" type content
- `duplicate` — substantially similar to another memory
- `stale` — was relevant but no longer is

## Similarity-Powered Classification

Each unclassified memory gets a `findSimilar` call during classification. The sub-LLM sees the memory alongside its nearest neighbors and makes richer judgments:

- **Exact duplicates** (identical content): Flag as `quality: 'duplicate'`
- **Near duplicates / merge candidates** (similar but not identical): Store as merge candidate in classifications Firestore collection via `ClassificationService.addMergeCandidate()` — these are different concepts from duplicates
- **Thematic clustering**: Similar memories that aren't duplicates get grouped into the same thematic cluster(s) automatically (multiple thematic groups per memory allowed, `snake_case` normalization)
- **Evolution detection**: "This is a newer version of an older memory" — flag as superseding, link to the original
- **Contradiction detection**: "This memory says you hate camping but three other memories describe camping trips you loved" — flag for coherence review (also feeds coherence pressure into mood)

## Low-Value Content Detection

Memories matching these patterns get flagged as `low_value`:
- Very short content with no context ("test", "asdf", "hello world")
- Content created and never accessed
- Content that duplicates existing memories

The ghost does NOT auto-delete — it surfaces flagged content to the user for review.

## Haiku Prompt Design

The sub-LLM receives:
- The memory's full content
- Its nearest neighbors from `findSimilar`
- The predefined genre list
- Instructions to assess quality, detect duplicates, and assign thematic group

The sub-LLM returns structured JSON with genre, quality signal, thematic group, and any duplicate/merge/contradiction flags.

## Batch Processing

- `CLASSIFICATION_BATCH_SIZE = 20` (defined in `src/services/rem.constants.ts`)
- Process in order of creation date (oldest unclassified first)
- Track progress via `unclassified_count` in the ClassificationIndex

## User-Facing Workflow

After classification, the ghost can surface results to the user:
1. "I organized your memories — you have 12 short stories, 5 stand-up bits, and 8 technical notes. I also found 3 that look like test data. Want me to clean those up?"
2. User can review, correct, or refine classifications
3. Corrections feed back into the ghost's classification model

## Coherence Pressure from Contradictions

When the sub-LLM detects contradictions between memories, this creates a coherence pressure via the existing pressure system:
- Create a `Pressure` targeting the `coherence` dimension
- Magnitude: `CONTRADICTION_PRESSURE_MAGNITUDE = -0.15` (defined in `src/services/rem.constants.ts`)
- Reason describes the contradiction detected

## Steps

1. Add classification step to REM cycle (after scoring, before mood update)
2. Query for unclassified memories (memories not present in any classification index list)
3. For each unclassified memory, call `findSimilar` to get nearest neighbors (top 5)
4. Build Haiku prompt with: memory content, neighbor contents, predefined genre list, quality signal options
5. Parse Haiku response: extract genre, quality signal, thematic group, duplicate flags
6. Write classifications via `ClassificationService.classify()`
7. Flag exact duplicates as `quality: 'duplicate'` (do NOT auto-delete)
8. Store merge candidates (near duplicates) in classifications Firestore collection via `ClassificationService.addMergeCandidate()`
9. Create coherence pressures from detected contradictions via `MoodService.addPressure()` with `CONTRADICTION_PRESSURE_MAGNITUDE = -0.15`
10. Cap batch size per cycle: `CLASSIFICATION_BATCH_SIZE = 20`
11. Update `unclassified_count` after processing
12. Handle Haiku errors gracefully — skip memory, retry next cycle

## Verification

- [ ] Unclassified memories are classified during REM cycle
- [ ] `findSimilar` is called for each memory to provide context
- [ ] Genres are from the predefined 18-value list
- [ ] Thematic groups are emergent (sub-LLM generated strings)
- [ ] Quality signals are from the 5-value enum
- [ ] Exact duplicates flagged as `quality: 'duplicate'`, NOT auto-deleted
- [ ] Near duplicates stored as merge candidates in classifications Firestore collection
- [ ] Contradictions create coherence pressures with `CONTRADICTION_PRESSURE_MAGNITUDE = -0.15`
- [ ] Batch size capped at `CLASSIFICATION_BATCH_SIZE = 20`
- [ ] Thematic groups use `snake_case` normalization; multiple per memory allowed
- [ ] Constants defined in `src/services/rem.constants.ts`
- [ ] `unclassified_count` updated after processing
- [ ] Handles Haiku errors gracefully (skip + retry next cycle)
- [ ] Tests colocated: appropriate `.spec.ts` file alongside implementation
