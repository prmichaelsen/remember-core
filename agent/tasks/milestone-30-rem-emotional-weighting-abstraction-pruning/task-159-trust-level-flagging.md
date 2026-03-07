# Task 159: Trust-Level Flagging

**Milestone**: [M30 - REM Emotional Weighting — Abstraction, Pruning & Reconciliation](../milestones/milestone-30-rem-emotional-weighting-abstraction-pruning.md)
**Estimated Time**: 3 hours
**Dependencies**: M29 (scoring — emotional scores must exist on memories)
**Status**: Not Started
**REM Phase**: Runs during Phase 0 (Score) or as a post-scoring pass — not a numbered phase itself

---

## Key Design Decisions

| Decision | Choice | Source |
|---|---|---|
| Flag storage | Firestore `classifications` table with `type: 'trust_level_concern'` | Clarification 19 |
| Flag content | Human-readable reason string explaining the concern | Clarification 19 |
| Dismissal | User can dismiss flags; dismissed flags tracked to prevent re-flagging for same issue | Clarification 19 |
| Trigger signals | High `feel_trauma`, `feel_vulnerability`, `feel_shame` on memories with public/broad trust level | Clarification 19 |
| Privacy stance | Suggestions only — never automatic trust level changes | Design doc |
| Scope | Only flags memories at trust level 1 (Public) or 2 (Internal) — levels where content is broadly visible | Clarification 19 |

---

## Concrete Examples

| Scenario | Emotional Scores | Trust Level | Flag Reason |
|---|---|---|---|
| Childhood trauma journal | `feel_trauma: 0.9`, `feel_vulnerability: 0.8` | Public (1) | "This memory discusses childhood trauma -- did you mean to make this public, or would you like to change the trust level so only your close friends can see it?" |
| Shame about job loss | `feel_shame: 0.85`, `feel_vulnerability: 0.7` | Internal (2) | "This memory contains sensitive content about a difficult personal experience -- you may want to restrict who can see it." |
| Embarrassing story | `feel_embarrassment: 0.6` | Public (1) | NOT flagged -- embarrassment alone is not a trigger; only trauma, vulnerability, and shame trigger flags |
| Private trauma journal | `feel_trauma: 0.95` | Secret (5) | NOT flagged -- already at appropriate trust level |

---

## Objective

Implement trust-level flagging — during REM scoring, flag memories where emotional scores indicate sensitive content that may be at an inappropriately broad trust level. Flags are stored in Firestore, include human-readable reasons, and can be dismissed by the user with tracking to prevent re-flagging.

---

## Implementation Steps

### 1. Define Flag Detection Rules and Thresholds

**File**: `src/services/rem.trust-flagging.ts` (new)

- **Trigger conditions** (ANY of these triggers a flag):
  - `feel_trauma >= 0.7` AND trust level <= 2 (Public or Internal)
  - `feel_vulnerability >= 0.7` AND trust level <= 2
  - `feel_shame >= 0.7` AND trust level <= 2
  - Combined: `(feel_trauma + feel_vulnerability + feel_shame) / 3 >= 0.6` AND trust level <= 2

- **Configurable thresholds**:
  ```typescript
  export const TRUST_FLAG_CONFIG = {
    individual_score_threshold: 0.7,    // single signal threshold
    combined_score_threshold: 0.6,      // average of trauma+vulnerability+shame
    max_trust_level_to_flag: 2,         // only flag Public (1) and Internal (2)
  } as const;
  ```

- **Exclusions**:
  - Memories at trust level >= 3 (Confidential, Restricted, Secret) — already restricted
  - Memories with existing non-dismissed flags for the same issue
  - Memories with dismissed flags (tracked via dismissal record)

### 2. Implement Reason Generation

**File**: `src/services/rem.trust-flagging.ts`

- Generate human-readable reason strings based on which signals triggered the flag:
  ```typescript
  function generateFlagReason(memory: {
    feel_trauma: number;
    feel_vulnerability: number;
    feel_shame: number;
    trust_score: TrustLevel;
  }): string
  ```

- **Reason templates**:
  - High trauma: "This memory discusses potentially traumatic content -- did you mean to make this {trustLabel}, or would you like to change the trust level so only your close friends can see it?"
  - High vulnerability: "This memory contains deeply personal content that reveals vulnerability -- you may want to restrict who can see it."
  - High shame: "This memory contains sensitive content about a difficult personal experience -- you may want to restrict who can see it."
  - Combined high: "This memory contains emotionally sensitive content (trauma, vulnerability) -- consider whether the current trust level ({trustLabel}) is appropriate."

- Use `TRUST_LABELS` from `src/types/trust.types.ts` to insert the human-readable trust level name

### 3. Create Firestore Classification Entries

**File**: `src/services/rem.trust-flagging.ts`

- **Classification record schema**:
  ```typescript
  interface TrustLevelFlag {
    id: string;                          // auto-generated
    memory_id: string;                   // UUID of the flagged memory
    user_id: string;                     // owner of the memory
    collection_id: string;               // Weaviate collection
    type: 'trust_level_concern';         // classification type
    reason: string;                      // human-readable reason
    trigger_scores: {                    // scores that triggered the flag
      feel_trauma: number;
      feel_vulnerability: number;
      feel_shame: number;
    };
    current_trust_level: TrustLevel;     // trust level at time of flagging
    status: 'active' | 'dismissed';      // flag status
    created_at: string;                  // ISO timestamp
    dismissed_at: string | null;         // ISO timestamp when dismissed
    dismissed_reason: string | null;     // optional user-provided reason for dismissal
  }
  ```

- Store in Firestore collection path: `classifications/{flagId}`
- Query by `user_id` + `type: 'trust_level_concern'` + `status: 'active'` for active flags

### 4. Implement Dismissal Tracking

**File**: `src/services/rem.trust-flagging.ts`

- **Dismiss function**:
  ```typescript
  async function dismissFlag(flagId: string, reason?: string): Promise<void>
  ```
  - Sets `status: 'dismissed'`
  - Sets `dismissed_at` to current timestamp
  - Optionally records `dismissed_reason`

- **Re-flagging prevention**:
  - Before creating a new flag, query Firestore for any existing classification matching:
    - Same `memory_id`
    - Same `type: 'trust_level_concern'`
    - `status: 'dismissed'`
  - If a dismissed flag exists for the same memory, do NOT create a new flag
  - Exception: if the memory's emotional scores have INCREASED significantly since the dismissed flag was created (e.g., re-scored with higher trauma), allow re-flagging. Compare `trigger_scores` from the dismissed flag against current scores. Only re-flag if any trigger score increased by >= 0.2.

### 5. Wire into REM Cycle

**Files**: `src/services/rem.service.ts`

- Trust-level flagging runs as a post-scoring pass within Phase 0 (Score), NOT as a separate numbered phase
- After scoring a batch of memories, check each scored memory against flag detection rules
- This avoids an extra query pass — piggybacks on the scoring phase when emotional scores are already loaded
- Does NOT need a separate step in `REM_STEPS` — it is part of the scoring step

### 6. Expose Active Flags via Query

**File**: `src/services/rem.trust-flagging.ts`

- **List active flags**:
  ```typescript
  async function getActiveTrustFlags(userId: string): Promise<TrustLevelFlag[]>
  ```
  - Queries Firestore for `user_id` + `type: 'trust_level_concern'` + `status: 'active'`
  - Ordered by `created_at` descending

- This function will be consumed by the app layer (remember-mcp) to display flags in the "rem" tab or a dedicated notifications panel

### 7. Write Tests

**File**: `src/services/rem.trust-flagging.spec.ts`

Tests to implement:

- **Flag creation — trauma**: Memory with `feel_trauma: 0.9` at trust level 1 (Public) generates a flag
- **Flag creation — vulnerability**: Memory with `feel_vulnerability: 0.8` at trust level 2 (Internal) generates a flag
- **Flag creation — shame**: Memory with `feel_shame: 0.75` at trust level 1 generates a flag
- **Flag creation — combined**: Memories where individual scores are below 0.7 but average >= 0.6 still get flagged
- **No flag — restricted trust**: Memory with `feel_trauma: 0.95` at trust level 3+ is NOT flagged
- **No flag — below threshold**: Memory with all trigger scores below 0.7 and average below 0.6 is NOT flagged
- **Reason generation**: Verify correct human-readable reason for each trigger type
- **Dismissal**: Dismissing a flag sets `status: 'dismissed'` and `dismissed_at`
- **Re-flagging prevention**: Dismissed flag prevents new flag for same memory
- **Re-flagging exception**: If emotional scores increase by >= 0.2 since dismissal, allow re-flagging
- **Firestore schema**: Flag stored with correct `type: 'trust_level_concern'` and all required fields
- **List active flags**: Returns only active (non-dismissed) flags for a user

---

## Verification Checklist

- [ ] Flags created for public/internal memories with high `feel_trauma` (>= 0.7)
- [ ] Flags created for public/internal memories with high `feel_vulnerability` (>= 0.7)
- [ ] Flags created for public/internal memories with high `feel_shame` (>= 0.7)
- [ ] Combined threshold (average >= 0.6) triggers flags even if individual scores < 0.7
- [ ] Memories at trust level >= 3 (Confidential+) are NOT flagged
- [ ] Flags stored in Firestore `classifications` with `type: 'trust_level_concern'`
- [ ] Each flag includes a human-readable reason string
- [ ] Reason strings reference the current trust level label
- [ ] Users can dismiss flags via `dismissFlag()`
- [ ] Dismissed flags are tracked (`status: 'dismissed'`, `dismissed_at`)
- [ ] Dismissed flags prevent re-flagging for the same memory
- [ ] Re-flagging allowed if emotional scores increased significantly (>= 0.2) since dismissal
- [ ] `getActiveTrustFlags()` returns only active flags for a user
- [ ] Trust-level flagging runs as part of Phase 0 (Score) — not a separate phase
- [ ] All tests pass — colocated at `src/services/rem.trust-flagging.spec.ts`

---

## Expected Output

- `src/services/rem.trust-flagging.ts` — flag detection rules, reason generation, Firestore CRUD, dismissal tracking
- `src/services/rem.trust-flagging.spec.ts` — colocated tests
- Updated `src/services/rem.service.ts` — trust-level flagging wired into scoring phase
- Firestore `classifications` collection schema for `trust_level_concern` records
