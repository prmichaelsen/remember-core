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
       - Genre/format (from predefined list of 18)
       - Quality signal (substantive, draft, low_value, duplicate, stale)
       - Thematic group (emergent, sub-LLM generated)
       - Duplicate/overlap detection (is this substantially the same as a similar match?)
       - Merge candidates (could this be consolidated with a similar memory?)
    4. Write classifications back via ClassificationService
    5. Update Firestore classification index
```

## Genres (predefined, 18 values)

`short_story`, `standup_bit`, `poem`, `essay`, `technical_note`, `recipe`, `journal_entry`, `brainstorm`, `conversation_summary`, `code_snippet`, `list`, `letter`, `review`, `tutorial`, `rant`, `dream_log`, `song_lyrics`, `other`

## Quality Signals (5 values)

- `substantive` — real content with value
- `draft` — work in progress, may have value later
- `low_value` — test data, throwaway notes, "asdf" type content
- `duplicate` — substantially similar to another memory
- `stale` — was relevant but no longer is

## Similarity-Powered Classification

Each unclassified memory gets a `findSimilar` call during classification. The sub-LLM sees the memory alongside its nearest neighbors and makes richer judgments:

- **Exact/near duplicates**: "This is the same camping checklist you saved last week, just with two extra items" — flag as `duplicate`, suggest merge
- **Thematic clustering**: Similar memories that aren't duplicates get grouped into the same thematic cluster automatically
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

- Cap the number of memories classified per REM cycle (e.g., batch size 10-20)
- Process in order of creation date (oldest unclassified first)
- Track progress via `unclassified_count` in the ClassificationIndex

## User-Facing Workflow

After classification, the ghost can surface results to the user:
1. "I organized your memories — you have 12 short stories, 5 stand-up bits, and 8 technical notes. I also found 3 that look like test data. Want me to clean those up?"
2. User can review, correct, or refine classifications
3. Corrections feed back into the ghost's classification model

## Coherence Pressure from Contradictions

When the sub-LLM detects contradictions between memories, this feeds a coherence pressure into the mood system:
- Create a `Pressure` targeting the `coherence` dimension
- Negative magnitude (reduces coherence)
- Reason describes the contradiction detected

## Steps

1. Add classification step to REM cycle (after scoring, before mood update)
2. Query for unclassified memories (memories not present in any classification index list)
3. For each unclassified memory, call `findSimilar` to get nearest neighbors (top 5)
4. Build Haiku prompt with: memory content, neighbor contents, predefined genre list, quality signal options
5. Parse Haiku response: extract genre, quality signal, thematic group, duplicate flags
6. Write classifications via `ClassificationService.classify()`
7. Flag duplicates as `quality: 'duplicate'` (do NOT auto-delete)
8. Flag merge candidates (store as metadata or tags on the memory)
9. Create coherence pressures from detected contradictions via `MoodService.addPressure()`
10. Cap batch size per cycle (10-20 memories)
11. Update `unclassified_count` after processing
12. Handle Haiku errors gracefully — skip memory, retry next cycle

## Verification

- [ ] Unclassified memories are classified during REM cycle
- [ ] `findSimilar` is called for each memory to provide context
- [ ] Genres are from the predefined 18-value list
- [ ] Thematic groups are emergent (sub-LLM generated strings)
- [ ] Quality signals are from the 5-value enum
- [ ] Duplicates flagged as `quality: 'duplicate'`, NOT auto-deleted
- [ ] Contradictions create coherence pressures in the mood system
- [ ] Batch size capped (10-20 per cycle)
- [ ] `unclassified_count` updated after processing
- [ ] Handles Haiku errors gracefully (skip + retry next cycle)
- [ ] Tests colocated: appropriate `.spec.ts` file alongside implementation
