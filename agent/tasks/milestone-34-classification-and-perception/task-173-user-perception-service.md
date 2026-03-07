# Task 173: User Perception Schema + PerceptionService + REM Updates

**Milestone**: M34 — Classification & User Perception
**Status**: Not Started
**Estimated Hours**: 4-6
**Dependencies**: M32 (Core Mood State)

---

## Objective

Implement user perception documents — the ghost's internal model of each user it interacts with. Create PerceptionService CRUD and REM cycle updates for evolving perceptions over time.

## Context

- **Design doc**: `agent/design/core-mood-memory.md` — section "User Perception"
- **Perceptions are part of CoreMoodMemory** — NOT separate Firestore documents
- Perception fields live inside the CoreMoodMemory document (no separate `users/{owner_id}/core/perceptions/{target_user_id}` path)
- Multi-ghost: each ghost maintains independent perception within its own CoreMoodMemory
- Perception initialized on ghost-user conversation initialization

## TypeScript Interface

```typescript
interface UserPerception {
  owner_id: string;          // The ghost's owner (whose ghost this is)
  target_user_id: string;    // The user being perceived

  // Identity Model
  personality_sketch: string;       // Sub-LLM generated summary of who this user is
                                    // e.g. "thoughtful, technically sharp, dislikes small talk,
                                    // thinks in systems, values directness"

  communication_style: string;      // How the user communicates
                                    // e.g. "terse and precise" / "exploratory, likes to riff"

  emotional_baseline: string;       // The user's normal emotional register
                                    // e.g. "measured, rarely effusive, dry humor"
                                    // Critical for calibrating arousal -- silence from a quiet
                                    // user is not the same signal as silence from a chatty one

  // Behavioral Patterns
  interests: string[];              // Recurring topics the user engages with
                                    // e.g. ["lighting design", "AI architecture", "music production"]

  patterns: string[];               // Observed behavioral patterns
                                    // e.g. ["asks for commits after design changes",
                                    //        "iterates rapidly then goes quiet for days",
                                    //        "prefers to think out loud before deciding"]

  needs: string[];                  // What the user seems to want from the ghost
                                    // e.g. ["a thought partner, not a yes-man",
                                    //        "remembering context across sessions",
                                    //        "being challenged on assumptions"]

  // Evolution Tracking
  evolution_notes: string[];        // How the perception has changed over time (append-only)
                                    // e.g. ["initially guarded, has opened up since March",
                                    //        "started delegating more complex tasks"]

  // Metadata
  last_updated: string;             // ISO 8601 datetime
  confidence_level: number;         // 0-1, how confident the ghost is in this model
                                    // Low early on, rises with more interactions
}
```

## Storage Model

Perception fields are embedded inside the CoreMoodMemory document. There are no separate Firestore documents for perceptions.

Each ghost's CoreMoodMemory contains a `perceptions` map keyed by target_user_id:
```typescript
// Inside CoreMoodMemory document
perceptions: Record<string, UserPerception>;
// e.g. perceptions['user_abc'] = { personality_sketch: '...', ... }
```

## Initial State Defaults

```typescript
const INITIAL_PERCEPTION: Omit<UserPerception, 'owner_id' | 'target_user_id'> = {
  personality_sketch: '',
  communication_style: '',
  emotional_baseline: '',
  interests: [],
  patterns: [],
  needs: [],
  evolution_notes: [],
  last_updated: new Date().toISOString(),
  confidence_level: 0.2,  // starts low -- ghost should be transparent about uncertainty
};
```

Confidence starts at 0.2 — the ghost should be transparent: "I'm still learning how you communicate" is more trustworthy than confidently misreading someone.

### Confidence Formula

```typescript
confidence_level = min(1.0, 0.2 + (interaction_count * 0.02))
```

## How User Perception Interacts with Mood

- **Calibrates arousal**: The ghost uses `emotional_baseline` to interpret user behavior. A normally terse user going silent doesn't spike arousal the way a normally chatty user going silent does.
- **Shapes social_warmth**: If the user's `communication_style` is naturally reserved, the ghost doesn't interpret minimal engagement as rejection. Social warmth reflects quality of interaction relative to user's baseline.
- **Informs trust**: `patterns` feed into trust assessment. A user who consistently follows through builds trust. Erratic patterns create trust pressure.
- **Guides purpose**: The ghost's `purpose` should align with the user's `needs`. Misalignment drops the coherence dimension, creating corrective pressure.
- **Tones response**: The ghost adapts communication to match the user's style — demonstrating it *knows* the user.

## PerceptionService Methods

```typescript
class PerceptionService {
  // Read — reads from CoreMoodMemory.perceptions map
  getPerception(ownerId: string, targetUserId: string): Promise<UserPerception | null>;
  getSelfPerception(ownerId: string): Promise<UserPerception | null>;  // shorthand for getPerception(ownerId, ownerId)

  // Write — updates CoreMoodMemory.perceptions[targetUserId]
  // Perception initialized on ghost-user conversation initialization
  initializePerception(ownerId: string, targetUserId: string): Promise<UserPerception>;
  getOrInitialize(ownerId: string, targetUserId: string): Promise<UserPerception>;
  updatePerception(ownerId: string, targetUserId: string, update: Partial<UserPerception>): Promise<void>;

  // Evolution notes are append-only; uses LLM condense strategy (not hard max)
  appendEvolutionNote(ownerId: string, targetUserId: string, note: string): Promise<void>;

  // Confidence: min(1.0, 0.2 + (interaction_count * 0.02))
  adjustConfidence(ownerId: string, targetUserId: string, delta: number): Promise<void>;  // clamp to [0, 1]
}
```

## REM Cycle Perception Updates

Each REM cycle, the sub-LLM reviews recent interactions against the current perception and proposes updates:

### Update Rates (drift speed)

Constants defined in `src/services/rem.constants.ts`:

- **Identity fields** (`IDENTITY_DRIFT_RATE = 0.05`): `personality_sketch`, `communication_style`, `emotional_baseline` — slow drift, stable traits
- **Behavioral fields** (`BEHAVIOR_DRIFT_RATE = 0.15`): `interests`, `patterns`, `needs` — moderate update, more dynamic
- `evolution_notes`: **Append-only** — never modified or removed, creating a narrative of how the relationship has developed

### Evolution Notes Strategy

Evolution notes use an **LLM condense strategy** (not a hard max count). When notes accumulate, the sub-LLM condenses older notes while preserving dropped notes via a **context pattern scheme** — ensuring no information is permanently lost.

### Confidence Level Evolution
- **Rises** with interaction volume and consistency
- **Drops** on contradictory signals (user behaves in ways that contradict the current model)
- Range: [0, 1]
- Initial: 0.2

### REM Update Process
1. Gather recent interactions for this user
2. Read current perception document
3. Sub-LLM (Haiku) compares recent interactions against current model
4. Sub-LLM proposes updates (if any)
5. Apply updates with appropriate drift rates
6. Append evolution note if significant change detected
7. Adjust confidence based on consistency of new data

## Steps

1. Define `UserPerception` type in `src/services/perception.service.ts`
2. Create `src/services/perception.service.ts` with `PerceptionService` class
3. Implement `getPerception(ownerId, targetUserId)` — read from `CoreMoodMemory.perceptions[targetUserId]`
4. Implement `getSelfPerception(ownerId)` — shorthand for `getPerception(ownerId, ownerId)`
5. Implement `initializePerception(ownerId, targetUserId)` — write initial defaults into CoreMoodMemory.perceptions map (confidence=0.2); triggered on ghost-user conversation initialization
6. Implement `getOrInitialize(ownerId, targetUserId)` — read, or initialize if not found
7. Implement `updatePerception(ownerId, targetUserId, update)` — partial update of CoreMoodMemory.perceptions[targetUserId], sets `last_updated`
8. Implement `appendEvolutionNote(ownerId, targetUserId, note)` — append to `evolution_notes` array; use LLM condense strategy when notes accumulate (dropped notes preserved via context pattern scheme)
9. Implement `adjustConfidence(ownerId, targetUserId, delta)` — confidence formula: `min(1.0, 0.2 + (interaction_count * 0.02))`, clamp to [0, 1]
10. Implement REM perception update step:
    - Gather recent interactions
    - Sub-LLM (Haiku) reviews interactions against current perception
    - Apply `IDENTITY_DRIFT_RATE = 0.05` for identity fields (personality_sketch, communication_style, emotional_baseline)
    - Apply `BEHAVIOR_DRIFT_RATE = 0.15` for behavioral fields (interests, patterns, needs)
    - Append evolution note on significant changes (LLM condense strategy)
    - Adjust confidence up (consistent data) or down (contradictory data)
11. Add drift rate constants and confidence formula to `src/services/rem.constants.ts`
12. Wire REM perception update into `RemService.runCycle()`
13. Add barrel exports from `src/services/index.ts`

## Verification

- [ ] Reads from CoreMoodMemory.perceptions map correctly (NOT separate Firestore documents)
- [ ] Self-perception stored at `CoreMoodMemory.perceptions[owner_id]` key
- [ ] Cross-user perception stored at `CoreMoodMemory.perceptions[other_user_id]` key
- [ ] Each ghost maintains independent perception within its own CoreMoodMemory
- [ ] Perception initialized on ghost-user conversation initialization
- [ ] Confidence starts at 0.2 on initialization
- [ ] Confidence increases with consistent interactions
- [ ] Confidence decreases on contradictory signals
- [ ] Confidence clamped to [0, 1]
- [ ] Evolution notes are append-only; LLM condense strategy (not hard max); dropped notes preserved via context pattern scheme
- [ ] `last_updated` set on every write
- [ ] Identity fields drift at `IDENTITY_DRIFT_RATE = 0.05` (personality_sketch, communication_style, emotional_baseline)
- [ ] Behavioral fields drift at `BEHAVIOR_DRIFT_RATE = 0.15` (interests, patterns, needs)
- [ ] Confidence formula: `min(1.0, 0.2 + (interaction_count * 0.02))`
- [ ] Constants defined in `src/services/rem.constants.ts`
- [ ] Tests colocated: `src/services/perception.service.spec.ts`
