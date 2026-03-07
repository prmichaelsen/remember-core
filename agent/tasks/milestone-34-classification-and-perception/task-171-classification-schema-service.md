# Task 171: Classification Schema + ClassificationService

**Milestone**: M34 — Classification & User Perception
**Status**: Not Started
**Estimated Hours**: 3-4

---

## Objective

Create Firestore classification index schema and implement ClassificationService with CRUD operations for browsing, querying, and updating memory classifications.

## Context

- **Design doc**: `agent/design/core-mood-memory.md` — section "Memory Classification"
- Classifications are **per Weaviate collection** — one Firestore document per collection
- Firestore path: `collections/{collection_id}/core/classifications`
- REM cycle classifies memories and builds this index; this task provides the data layer
- Classifications enable filtered retrieval: "show me all my stand-up bits" without semantic search

## TypeScript Interfaces

```typescript
interface ClassificationIndex {
  // Genre/Format -- what kind of content is this?
  genres: Record<string, string[]>;  // genre name -> array of memory_ids

  // Thematic Groups -- what cluster does this belong to?
  // Emergent, not predefined -- the sub-LLM generates them
  thematic_groups: Record<string, string[]>;  // group name -> array of memory_ids

  // Quality Signal -- is this worth keeping?
  // Multiple quality signals allowed per memory (NOT mutually exclusive)
  quality: Record<string, string[]>;  // quality signal -> array of memory_ids

  // Merge Candidates -- near-duplicate pairs identified for potential consolidation
  // Stored here (NOT on individual memories) — one list per collection
  merge_candidates: Array<{ memory_id_a: string; memory_id_b: string; reason: string }>;

  // Metadata
  last_updated: string;        // ISO 8601 datetime
  unclassified_count: number;  // number of memories not yet classified
}
```

## Genre Enum (18 predefined values — closed set)

Genres are a **closed set** of 18 values. The sub-LLM must pick from this list only. This constraint is required for Firestore filtering.

```typescript
type Genre =
  | 'short_story'
  | 'standup_bit'
  | 'poem'
  | 'essay'
  | 'technical_note'
  | 'recipe'
  | 'journal_entry'
  | 'brainstorm'
  | 'conversation_summary'
  | 'code_snippet'
  | 'list'
  | 'letter'
  | 'review'
  | 'tutorial'
  | 'rant'
  | 'dream_log'
  | 'song_lyrics'
  | 'other';
```

## Quality Signal Enum (5 values)

**Multiple quality signals allowed per memory** — they are NOT mutually exclusive. A memory can be both `draft` and `low_value`, for example.

- `duplicate` = **exact content match** (identical or near-identical text)
- Merge candidate = **near duplicate** (similar content worth consolidating, but not identical) — stored in `merge_candidates`, not as a quality signal

```typescript
type QualitySignal =
  | 'substantive'    // real content with value
  | 'draft'          // work in progress, may have value later
  | 'low_value'      // test data, throwaway notes, "asdf" type content
  | 'duplicate'      // exact content match with another memory
  | 'stale';         // was relevant but no longer is
```

## Thematic Groups

Thematic groups are **emergent** -- the sub-LLM generates them during classification, not predefined. A single memory can belong to **multiple thematic groups**.

Thematic group names use **`snake_case` normalization** (e.g., `music_production` not `music-production`).

Examples:
- `music_production`
- `ai_architecture`
- `relationship_advice`
- `work_complaints`

## Firestore Document Structure

```yaml
# Firestore path: collections/{collection_id}/core/classifications
genres:
  short_story: [memory_id_1, memory_id_7, memory_id_23]
  standup_bit: [memory_id_4, memory_id_15]
  technical_note: [memory_id_2, memory_id_9, memory_id_11]
  # ...

thematic_groups:
  music_production: [memory_id_3, memory_id_8]
  ai_architecture: [memory_id_2, memory_id_5, memory_id_11]
  # A single memory can appear in multiple thematic groups

quality:
  # Multiple quality signals per memory allowed (NOT mutually exclusive)
  low_value: [memory_id_6, memory_id_14]
  duplicate: [memory_id_12]        # exact content match
  stale: [memory_id_10]

merge_candidates:
  - { memory_id_a: memory_id_3, memory_id_b: memory_id_8, reason: "similar camping checklists" }
  # near duplicates — similar but not identical, worth consolidating

last_updated: datetime
unclassified_count: int
```

## ClassificationService Methods

```typescript
class ClassificationService {
  // Read operations
  getClassifications(collectionId: string): Promise<ClassificationIndex | null>;
  getByGenre(collectionId: string, genre: Genre): Promise<string[]>;        // returns memory_ids
  getByQuality(collectionId: string, quality: QualitySignal): Promise<string[]>;
  getByThematicGroup(collectionId: string, group: string): Promise<string[]>;
  getUnclassifiedCount(collectionId: string): Promise<number>;
  getMergeCandidates(collectionId: string): Promise<ClassificationIndex['merge_candidates']>;

  // Write operations
  classify(collectionId: string, memoryId: string, classification: {
    genre?: Genre;
    qualities?: QualitySignal[];      // multiple allowed per memory
    thematic_groups?: string[];       // multiple allowed per memory, snake_case
  }): Promise<void>;

  addMergeCandidate(collectionId: string, candidate: {
    memory_id_a: string;
    memory_id_b: string;
    reason: string;
  }): Promise<void>;

  // Remove a memory from all classification lists (e.g., when memory deleted)
  removeFromIndex(collectionId: string, memoryId: string): Promise<void>;

  // Initialize empty index
  initializeIndex(collectionId: string): Promise<ClassificationIndex>;
  getOrInitialize(collectionId: string): Promise<ClassificationIndex>;

  // Update unclassified count
  setUnclassifiedCount(collectionId: string, count: number): Promise<void>;
}
```

## Steps

1. Define `ClassificationIndex`, `Genre`, and `QualitySignal` types
2. Create `src/services/classification.service.ts`
3. Implement `getClassifications` — read from `collections/{collection_id}/core/classifications`
4. Implement `getByGenre` — return memory_ids for a specific genre
5. Implement `getByQuality` — return memory_ids for a specific quality signal
6. Implement `getByThematicGroup` — return memory_ids for a specific thematic group
7. Implement `getUnclassifiedCount` — return the unclassified_count field
8. Implement `classify` — add memoryId to the appropriate genre/quality/thematic_group arrays (multiple qualities and thematic groups per memory)
9. Implement `addMergeCandidate` — append a merge candidate entry to the classifications doc
10. Implement `removeFromIndex` — remove memoryId from all arrays (genres, quality, thematic_groups) and merge_candidates
11. Implement `initializeIndex` — create empty index with empty maps, empty merge_candidates array, and unclassified_count=0
12. Implement `getOrInitialize` — read, or initialize if not found
13. Implement `setUnclassifiedCount` — update the count field
14. Implement `getMergeCandidates` — return merge_candidates array
15. Add barrel exports from `src/services/index.ts`

## Verification

- [ ] Reads from Firestore correctly (returns null when not found)
- [ ] Genre queries return correct memory_id arrays
- [ ] Quality signal queries return correct memory_id arrays
- [ ] Thematic group queries return correct memory_id arrays
- [ ] `classify` adds memory to correct arrays without duplicating; supports multiple qualities and thematic groups per memory
- [ ] `removeFromIndex` removes memory from all arrays across all categories and from merge_candidates
- [ ] Merge candidates stored in classifications doc (one list per collection)
- [ ] Unclassified count is accurate
- [ ] `last_updated` is set on every write
- [ ] Genre validation enforces the 18-value enum
- [ ] Quality validation enforces the 5-value enum
- [ ] Thematic groups accept any string (emergent, not validated), normalized to `snake_case`
- [ ] A single memory can belong to multiple thematic groups
- [ ] Tests colocated: `src/services/classification.service.spec.ts`
