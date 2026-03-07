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
- Firestore path: `users/{owner_id}/core/perceptions/{target_user_id}`
- The relationship is many-to-many: a user can have multiple ghosts, a ghost can interact with multiple users
- Perceptions are stored as a Firestore **subcollection** — one document per ghost-user pair

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

## Firestore Paths

- **Self-perception** (ghost's model of its owner): `users/{owner_id}/core/perceptions/{owner_id}`
- **Cross-user perception** (model of another user): `users/{owner_id}/core/perceptions/{other_user_id}`

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

## How User Perception Interacts with Mood

- **Calibrates arousal**: The ghost uses `emotional_baseline` to interpret user behavior. A normally terse user going silent doesn't spike arousal the way a normally chatty user going silent does.
- **Shapes social_warmth**: If the user's `communication_style` is naturally reserved, the ghost doesn't interpret minimal engagement as rejection. Social warmth reflects quality of interaction relative to user's baseline.
- **Informs trust**: `patterns` feed into trust assessment. A user who consistently follows through builds trust. Erratic patterns create trust pressure.
- **Guides purpose**: The ghost's `purpose` should align with the user's `needs`. Misalignment drops the coherence dimension, creating corrective pressure.
- **Tones response**: The ghost adapts communication to match the user's style — demonstrating it *knows* the user.

## PerceptionService Methods

```typescript
class PerceptionService {
  // Read
  getPerception(ownerId: string, targetUserId: string): Promise<UserPerception | null>;
  getSelfPerception(ownerId: string): Promise<UserPerception | null>;  // shorthand for getPerception(ownerId, ownerId)

  // Write
  initializePerception(ownerId: string, targetUserId: string): Promise<UserPerception>;
  getOrInitialize(ownerId: string, targetUserId: string): Promise<UserPerception>;
  updatePerception(ownerId: string, targetUserId: string, update: Partial<UserPerception>): Promise<void>;

  // Evolution notes are append-only
  appendEvolutionNote(ownerId: string, targetUserId: string, note: string): Promise<void>;

  // Confidence management
  adjustConfidence(ownerId: string, targetUserId: string, delta: number): Promise<void>;  // clamp to [0, 1]
}
```

## REM Cycle Perception Updates

Each REM cycle, the sub-LLM reviews recent interactions against the current perception and proposes updates:

### Update Rates (drift speed)
- `personality_sketch`: **Slow drift** — like purpose, only changes after sustained patterns
- `communication_style`: **Slow drift** — stable trait, rarely changes
- `emotional_baseline`: **Slow drift** — stable trait
- `patterns`: **Moderate update** — new patterns added readily, old ones updated
- `interests`: **Moderate update** — new interests added readily
- `needs`: **Moderate update** — refined as ghost learns more
- `evolution_notes`: **Append-only** — never modified or removed, creating a narrative of how the relationship has developed

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
3. Implement `getPerception(ownerId, targetUserId)` — read from `users/{owner_id}/core/perceptions/{target_user_id}`
4. Implement `getSelfPerception(ownerId)` — shorthand for `getPerception(ownerId, ownerId)`
5. Implement `initializePerception(ownerId, targetUserId)` — write initial defaults (confidence=0.2)
6. Implement `getOrInitialize(ownerId, targetUserId)` — read, or initialize if not found
7. Implement `updatePerception(ownerId, targetUserId, update)` — partial Firestore update, sets `last_updated`
8. Implement `appendEvolutionNote(ownerId, targetUserId, note)` — append to `evolution_notes` array (never remove/modify)
9. Implement `adjustConfidence(ownerId, targetUserId, delta)` — add delta to confidence, clamp to [0, 1]
10. Implement REM perception update step:
    - Gather recent interactions
    - Sub-LLM (Haiku) reviews interactions against current perception
    - Apply slow-drift updates for identity fields, moderate updates for behavioral fields
    - Append evolution note on significant changes
    - Adjust confidence up (consistent data) or down (contradictory data)
11. Wire REM perception update into `RemService.runCycle()`
12. Add barrel exports from `src/services/index.ts`

## Verification

- [ ] Reads from Firestore subcollection correctly
- [ ] Self-perception stored at `perceptions/{owner_id}` key
- [ ] Cross-user perception stored at `perceptions/{other_user_id}` key
- [ ] Confidence starts at 0.2 on initialization
- [ ] Confidence increases with consistent interactions
- [ ] Confidence decreases on contradictory signals
- [ ] Confidence clamped to [0, 1]
- [ ] Evolution notes are append-only (never modified or removed)
- [ ] `last_updated` set on every write
- [ ] Personality_sketch and communication_style drift slowly
- [ ] Patterns and interests update more readily
- [ ] Tests colocated: `src/services/perception.service.spec.ts`
