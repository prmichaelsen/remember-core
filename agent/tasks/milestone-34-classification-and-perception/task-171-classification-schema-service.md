# Task 171: Classification Schema + ClassificationService

**Milestone**: M34 — Classification & User Perception
**Status**: Not Started
**Estimated Hours**: 3-4

---

## Objective

Create Firestore classification index schema and implement ClassificationService with CRUD operations for browsing, querying, and updating memory classifications.

## Context

- **Design doc**: `agent/design/core-mood-memory.md` — section "Memory Classification"
- Firestore path: `users/{user_id}/core/classifications`
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
  quality: Record<string, string[]>;  // quality signal -> array of memory_ids

  // Metadata
  last_updated: string;        // ISO 8601 datetime
  unclassified_count: number;  // number of memories not yet classified
}
```

## Genre Enum (18 predefined values)

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

```typescript
type QualitySignal =
  | 'substantive'    // real content with value
  | 'draft'          // work in progress, may have value later
  | 'low_value'      // test data, throwaway notes, "asdf" type content
  | 'duplicate'      // substantially similar to another memory
  | 'stale';         // was relevant but no longer is
```

## Thematic Groups

Thematic groups are **emergent** -- the sub-LLM generates them during classification, not predefined. Examples:
- `music-production`
- `ai-architecture`
- `relationship-advice`
- `work-complaints`

## Firestore Document Structure

```yaml
# Firestore path: users/{user_id}/core/classifications
genres:
  short_story: [memory_id_1, memory_id_7, memory_id_23]
  standup_bit: [memory_id_4, memory_id_15]
  technical_note: [memory_id_2, memory_id_9, memory_id_11]
  # ...

thematic_groups:
  music-production: [memory_id_3, memory_id_8]
  ai-architecture: [memory_id_2, memory_id_5, memory_id_11]
  # ...

quality:
  low_value: [memory_id_6, memory_id_14]
  duplicate: [memory_id_12]
  stale: [memory_id_10]

last_updated: datetime
unclassified_count: int
```

## ClassificationService Methods

```typescript
class ClassificationService {
  // Read operations
  getClassifications(userId: string): Promise<ClassificationIndex | null>;
  getByGenre(userId: string, genre: Genre): Promise<string[]>;        // returns memory_ids
  getByQuality(userId: string, quality: QualitySignal): Promise<string[]>;
  getByThematicGroup(userId: string, group: string): Promise<string[]>;
  getUnclassifiedCount(userId: string): Promise<number>;

  // Write operations
  classify(userId: string, memoryId: string, classification: {
    genre?: Genre;
    quality?: QualitySignal;
    thematic_group?: string;
  }): Promise<void>;

  // Remove a memory from all classification lists (e.g., when memory deleted)
  removeFromIndex(userId: string, memoryId: string): Promise<void>;

  // Initialize empty index
  initializeIndex(userId: string): Promise<ClassificationIndex>;
  getOrInitialize(userId: string): Promise<ClassificationIndex>;

  // Update unclassified count
  setUnclassifiedCount(userId: string, count: number): Promise<void>;
}
```

## Steps

1. Define `ClassificationIndex`, `Genre`, and `QualitySignal` types
2. Create `src/services/classification.service.ts`
3. Implement `getClassifications` — read from `users/{user_id}/core/classifications`
4. Implement `getByGenre` — return memory_ids for a specific genre
5. Implement `getByQuality` — return memory_ids for a specific quality signal
6. Implement `getByThematicGroup` — return memory_ids for a specific thematic group
7. Implement `getUnclassifiedCount` — return the unclassified_count field
8. Implement `classify` — add memoryId to the appropriate genre/quality/thematic_group arrays in the index
9. Implement `removeFromIndex` — remove memoryId from all arrays (genres, quality, thematic_groups)
10. Implement `initializeIndex` — create empty index with empty maps and unclassified_count=0
11. Implement `getOrInitialize` — read, or initialize if not found
12. Implement `setUnclassifiedCount` — update the count field
13. Add barrel exports from `src/services/index.ts`

## Verification

- [ ] Reads from Firestore correctly (returns null when not found)
- [ ] Genre queries return correct memory_id arrays
- [ ] Quality signal queries return correct memory_id arrays
- [ ] Thematic group queries return correct memory_id arrays
- [ ] `classify` adds memory to correct arrays without duplicating
- [ ] `removeFromIndex` removes memory from all arrays across all categories
- [ ] Unclassified count is accurate
- [ ] `last_updated` is set on every write
- [ ] Genre validation enforces the 18-value enum
- [ ] Quality validation enforces the 5-value enum
- [ ] Thematic groups accept any string (emergent, not validated)
- [ ] Tests colocated: `src/services/classification.service.spec.ts`
