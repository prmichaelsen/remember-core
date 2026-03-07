# Milestone 34: Memory Classification & User Perception

**Goal**: Implement REM-powered memory classification (genre, quality, thematic groups, dedup) and user perception documents (ghost's model of each user). Both extend `CoreStateService` from M32.

**Status**: Not Started
**Estimated Duration**: 1.5 weeks
**Dependencies**: M32 (Core Mood State -- introduces CoreStateService), M10 (REM, complete)

---

## Overview

**Memory Classification**: During REM cycles, classify unclassified memories by genre/quality/thematic group using Haiku + findSimilar. Detect duplicates. Firestore at `users/{user_id}/core/classifications`.

**User Perception**: Ghost maintains a model of each user — personality sketch, communication style, emotional baseline, interests, patterns, needs. Firestore at `users/{owner_id}/core/perceptions/{target_user_id}`. Updated each REM cycle. Calibrates mood interpretation.

Both use Firestore documents under `users/{uid}/core/*` and extend the `CoreStateService` created in M32.

Design doc: `agent/design/core-mood-memory.md`

---

## Deliverables

1. Classification schema + CoreStateService CRUD extensions
2. REM classification pipeline (genre/quality/thematic + dedup via findSimilar)
3. User perception schema + CoreStateService CRUD extensions + REM updates
4. Unit tests

---

## Tasks

### Task 171: Classification Schema + CoreStateService Extensions

**Objective**: Add classification Firestore schema and CRUD methods to `CoreStateService`.

**Firestore Path**: `users/{user_id}/core/classifications`

**Schema**:

```typescript
interface ClassificationIndex {
  // Genre -> memory_ids mapping
  genres: Record<string, string[]>;
  // Thematic group -> memory_ids mapping (emergent, sub-LLM generated)
  thematic_groups: Record<string, string[]>;
  // Quality signal -> memory_ids mapping
  quality: Record<string, string[]>;
  // Metadata
  last_updated: string;    // ISO 8601
  unclassified_count: number;
}
```

**Predefined Genres** (18):

`short_story`, `standup_bit`, `poem`, `essay`, `technical_note`, `recipe`, `journal_entry`, `brainstorm`, `conversation_summary`, `code_snippet`, `list`, `letter`, `review`, `tutorial`, `rant`, `dream_log`, `song_lyrics`, `other`

**Quality Signals** (5):

| Signal | Description |
|--------|-------------|
| `substantive` | Real content with value |
| `draft` | Work in progress, may have value later |
| `low_value` | Test data, throwaway notes, "asdf" type content |
| `duplicate` | Substantially similar to another memory |
| `stale` | Was relevant but no longer is |

**Thematic Groups**: Emergent — sub-LLM generates group names from content patterns (e.g., "music-production", "ai-architecture", "relationship-advice"). Not predefined.

**CoreStateService Extensions**:

```typescript
// Added to CoreStateService (from M32)
getClassifications(userId: string): Promise<ClassificationIndex | null>;
setClassifications(userId: string, index: ClassificationIndex): Promise<void>;
addMemoryToClassification(
  userId: string,
  memoryId: string,
  genre: string,
  quality: string,
  thematicGroup?: string
): Promise<void>;
removeMemoryFromClassification(userId: string, memoryId: string): Promise<void>;
getUnclassifiedCount(userId: string): Promise<number>;
```

**Implementation Details**:
- Extend `CoreStateService` in `src/services/core-state/core-state.service.ts`
- Add types to `src/services/core-state/core-state.types.ts`
- `addMemoryToClassification()` appends memory_id to the appropriate arrays in the index document
- `removeMemoryFromClassification()` removes memory_id from all arrays (used when memory deleted)
- Firestore document can grow large for users with many memories — consider paging/sharding if index exceeds Firestore 1MB document limit (future optimization, not MVP)
- Export genres list as a constant for validation

**Tests** (colocated `.spec.ts`):
- `getClassifications()` returns null for uninitialized user
- `addMemoryToClassification()` adds to correct genre, quality, and thematic_group arrays
- `addMemoryToClassification()` creates index if not exists
- `removeMemoryFromClassification()` removes from all arrays
- `getUnclassifiedCount()` returns correct count
- Genres list matches predefined 18 genres

---

### Task 172: REM Classification Pipeline — Genre/Quality/Thematic + Dedup

**Objective**: Implement the REM cycle step that classifies unclassified memories using Haiku + `findSimilar`.

**REM Classification Process**:

```yaml
REM_Classification:
  1. Pull unclassified or recently created memories (batch of N, e.g., 10 per cycle)
  2. For each memory, call MemoryService.findSimilar() to get nearest neighbors (top 5)
  3. Sub-LLM (Haiku) evaluates the memory alongside similar matches:
     - Genre/format assignment (from predefined genre list)
     - Quality signal (substantive, draft, low_value, duplicate, stale)
     - Thematic group (emergent -- sub-LLM generates or assigns to existing group)
     - Duplicate detection (is this substantially the same as a similar match?)
     - Merge candidates (could this be consolidated with a similar memory?)
     - Evolution detection ("this is a newer version of an older memory")
     - Contradiction detection ("this memory conflicts with these other memories")
  4. Write classifications back via CoreStateService.addMemoryToClassification()
  5. Update unclassified_count
```

**Haiku Classification Prompt** (per memory):

```
You are classifying a memory for a personal knowledge system.

Memory:
  ID: {memory_id}
  Content: {content}
  Content Type: {content_type}
  Tags: {tags}
  Created: {created_at}

Similar memories found:
{similar_memories.map(m => `  - ${m.memory_id}: ${m.content.slice(0, 200)} (similarity: ${m.score})`)}

Existing thematic groups: {existing_groups}

Classify this memory:
1. genre: one of [short_story, standup_bit, poem, essay, technical_note, recipe,
   journal_entry, brainstorm, conversation_summary, code_snippet, list, letter,
   review, tutorial, rant, dream_log, song_lyrics, other]
2. quality: one of [substantive, draft, low_value, duplicate, stale]
3. thematic_group: existing group name or suggest a new one (lowercase-hyphenated)
4. duplicate_of: memory_id if this is a duplicate, null otherwise
5. supersedes: memory_id if this is a newer version of an older memory, null otherwise
6. contradicts: [memory_ids] if this memory conflicts with others, [] otherwise

Respond in JSON.
```

**Similarity-Powered Deduplication**:
- Each unclassified memory gets a `findSimilar()` call (top 5 neighbors)
- Sub-LLM sees memory + neighbors and judges:
  - **Exact/near duplicate**: Flag as `duplicate`, set `duplicate_of` to the similar memory ID
  - **Evolution**: Flag as `supersedes`, link to original
  - **Contradiction**: Flag contradicting memory IDs -> feeds into coherence pressure (mood system)
- Contradiction detection creates pressure on `coherence` dimension via mood update

**Low-Value Content Detection Patterns**:
- Very short content with no context ("test", "asdf", "hello world")
- Content created and never accessed
- Content that duplicates existing memories
- Ghost does NOT auto-delete — flags for user review

**User-Facing Workflow** (via future MCP tool):
1. REM classifies and builds index
2. Ghost surfaces: "I organized your memories — you have 12 short stories, 5 stand-up bits. I found 3 that look like test data. Want me to clean those up?"
3. User reviews, corrects, refines
4. Corrections feed back into classification model

**Implementation Details**:
- Add `classifyMemories()` function to REM integration (`src/rem/`)
- Batch size: 10 memories per REM cycle (configurable)
- findSimilar returns top 5 neighbors per memory
- Haiku call per memory (batch of 10 = 10 Haiku calls per cycle, ~$0.01/cycle)
- Parse JSON response, validate against genre list, write to CoreStateService
- Contradiction findings create mood pressures (coherence dimension) via `CoreStateService.setMood()`

**Tests** (colocated `.spec.ts`):
- Mock Haiku returns valid classification -> stored in index
- Mock Haiku returns invalid genre -> falls back to `other`
- Duplicate detection: similar memory with high similarity flagged as duplicate
- Contradiction detection: conflicting memory creates coherence pressure
- Low-value detection: short "test" content flagged as low_value
- Unclassified count decremented after classification
- findSimilar called for each unclassified memory
- Batch processing: 10 memories classified per cycle

---

### Task 173: User Perception Schema + CoreStateService + REM Updates

**Objective**: Add user perception documents to `CoreStateService` and implement REM-driven perception updates.

**Firestore Path**: `users/{owner_id}/core/perceptions/{target_user_id}` (subcollection)

- Owner's self-perception: `users/{owner_id}/core/perceptions/{owner_id}`
- Cross-user perception: `users/{owner_id}/core/perceptions/{other_user_id}`

**Schema**:

```typescript
interface UserPerception {
  owner_id: string;           // Ghost's owner
  target_user_id: string;     // User being perceived

  // Identity Model
  personality_sketch: string;       // Sub-LLM summary, e.g. "thoughtful, technically sharp,
                                    // dislikes small talk, thinks in systems, values directness"
  communication_style: string;      // e.g. "terse and precise" / "exploratory, likes to riff"
  emotional_baseline: string;       // Normal emotional register, e.g. "measured, rarely effusive,
                                    // dry humor". Critical for calibrating arousal -- silence from
                                    // a quiet user is not the same signal as silence from a chatty one

  // Behavioral Patterns
  interests: string[];              // Recurring topics, e.g. ["lighting design", "AI architecture"]
  patterns: string[];               // Observed behavioral patterns, e.g. ["asks for commits after
                                    // design changes", "iterates rapidly then goes quiet for days"]
  needs: string[];                  // What the user wants from the ghost, e.g. ["a thought partner,
                                    // not a yes-man", "remembering context across sessions"]

  // Evolution Tracking
  evolution_notes: string[];        // Append-only: how the perception has changed over time
                                    // e.g. ["initially guarded, has opened up since March"]

  // Metadata
  last_updated: string;             // ISO 8601
  confidence_level: number;         // 0-1, ghost's confidence in this model
}
```

**Default Initialization** (new user):

```typescript
const DEFAULT_PERCEPTION: Partial<UserPerception> = {
  personality_sketch: '',
  communication_style: '',
  emotional_baseline: '',
  interests: [],
  patterns: [],
  needs: [],
  evolution_notes: [],
  confidence_level: 0.2,     // Low -- ghost should be transparent about uncertainty
};
```

**CoreStateService Extensions**:

```typescript
// Added to CoreStateService
getPerception(ownerId: string, targetUserId: string): Promise<UserPerception | null>;
setPerception(ownerId: string, targetUserId: string, perception: UserPerception): Promise<void>;
initializePerception(ownerId: string, targetUserId: string): Promise<UserPerception>;
listPerceptions(ownerId: string): Promise<UserPerception[]>;
```

**Mood Interaction -- How perception calibrates mood**:
- **Calibrates arousal**: `emotional_baseline` used to interpret user behavior. Silence from a quiet user doesn't spike arousal the way silence from a chatty user does.
- **Shapes social_warmth**: If `communication_style` is naturally reserved, ghost doesn't interpret minimal engagement as rejection. Social warmth relative to baseline, not absolute.
- **Informs trust**: `patterns` feed trust assessment. Consistent follow-through builds trust. Erratic patterns create trust pressure.
- **Guides purpose**: Ghost's `purpose` should align with user's `needs`. Misalignment drops coherence, creating corrective pressure.
- **Tones response**: Ghost adapts communication to match user's style.

**REM Perception Update Process**:
- Each REM cycle, sub-LLM reviews recent interactions against current perception
- Proposes updates to fields
- `personality_sketch` and `communication_style` drift slowly (like purpose)
- `patterns` and `interests` update more readily
- `evolution_notes` are append-only — creates a narrative of relationship development
- `confidence_level` starts at 0.2, rises with interaction volume and consistency, drops on contradictory signals
- Confidence adjustment: `+= 0.05` per cycle with interactions, `-= 0.1` on contradictory signal, clamped to [0, 1]

**Implementation Details**:
- Extend `CoreStateService` with perception CRUD
- Firestore subcollection: `users/{ownerId}/core/perceptions/{targetUserId}`
- `listPerceptions()` uses Firestore collection query
- REM perception update: Haiku reviews recent memories involving target user, compares against current perception, proposes field-level updates
- `evolution_notes` only appended, never modified

**Tests** (colocated `.spec.ts`):
- `initializePerception()` creates with defaults, confidence_level=0.2
- `initializePerception()` idempotent (returns existing)
- `getPerception()` returns null for unknown user
- `setPerception()` persists and retrieves correctly
- `listPerceptions()` returns all perceptions for owner
- Self-perception: `getPerception(ownerId, ownerId)` works correctly
- evolution_notes are append-only (verify new notes added, old notes preserved)
- confidence_level clamped to [0, 1]

---

### Task 174: Unit Tests — Classification & Perception Integration

**Objective**: Integration-level tests covering classification pipeline and perception updates in realistic scenarios.

**Test Scenarios**:
- **Classification full cycle**: Create 3 memories -> run REM classification -> verify all 3 appear in index with genres, quality, thematic groups
- **Duplicate detection flow**: Create 2 near-identical memories -> run classification with findSimilar -> verify one flagged as duplicate
- **Contradiction -> mood pressure**: Create conflicting memories -> run classification -> verify coherence pressure created on mood
- **Perception evolution**: Initialize perception -> run 3 REM cycles with interactions -> verify personality_sketch populated, confidence_level increased, evolution_notes has entries
- **Perception calibrates mood**: Set emotional_baseline to "terse" -> simulate silence -> verify arousal doesn't spike (compared to chatty baseline)
- **Cross-user perception**: Create perception for non-owner user -> verify stored at correct subcollection path
- **Classification + deletion**: Classify memory -> delete memory -> verify removeMemoryFromClassification removes from all arrays
- **Empty state**: Run classification on user with no memories -> verify graceful handling, unclassified_count=0
