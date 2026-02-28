# Ghost/Persona System

**Concept**: Cross-user memory access via AI-mediated ghost conversations with trust enforcement
**Created**: 2026-02-28
**Status**: Design Specification

---

## Overview

The ghost/persona system enables cross-user interaction through AI-mediated conversations. User B talks to User A's "ghost" — an AI representation that speaks in first person, searches User A's memories on every message, and reveals information according to trust levels. This design covers the types, configuration, and services extracted into the remember-core SDK.

Adapted from remember-mcp's `local.ghost-persona-system.md` for the remember-core SDK.

---

## Problem Statement

- Users want to share aspects of their memory with others in a controlled way.
- Direct memory access is too permissive — users need granular trust controls.
- The ghost conversation model requires configuration (enabled/disabled, trust levels, enforcement mode, blocked users) stored in Firestore.
- Ghost conversations produce their own memories (`content_type: 'ghost'`) that track relationship quality over time.
- All of this logic must be transport-agnostic for reuse across MCP, REST, and CLI adapters.

---

## Solution

### Ghost Conversation Model

```
User B opens ghost conversation → system prompt establishes ghost identity
→ On EVERY message, ghost calls search on User A's collection
→ Query includes trust filter: trust_score <= accessor_trust_level
→ Ghost responds based on retrieved memories, speaking as User A
```

### GhostConfig (Firestore-backed)

Each user's ghost persona settings, stored at `users/{ownerUserId}/ghost_config`:

```typescript
type TrustEnforcementMode = 'query' | 'prompt' | 'hybrid';

interface GhostConfig {
  enabled: boolean;                         // false by default — opt-in
  public_ghost_enabled: boolean;            // allow non-friends to chat
  default_friend_trust: number;             // default 0.25
  default_public_trust: number;             // default 0 (strangers see nothing)
  per_user_trust: Record<string, number>;   // userId → trust level overrides
  blocked_users: string[];                  // users blocked from ghost access
  enforcement_mode: TrustEnforcementMode;   // default 'query'
}

const DEFAULT_GHOST_CONFIG: GhostConfig = {
  enabled: false,
  public_ghost_enabled: false,
  default_friend_trust: 0.25,
  default_public_trust: 0,
  per_user_trust: {},
  blocked_users: [],
  enforcement_mode: 'query',
};
```

### GhostModeContext (Server-Side Resolution)

Added to `AuthContext` for ghost conversations:

```typescript
interface GhostModeContext {
  owner_user_id: string;          // whose memories are being accessed
  accessor_user_id: string;       // who is talking to the ghost
  accessor_trust_level: number;   // resolved trust level for this accessor
}

// Extended AuthContext
interface AuthContext {
  // ... existing fields ...
  ghostMode?: GhostModeContext;
}
```

### Trust Resolution Order

1. Check `blocked_users` → deny if blocked
2. Check `per_user_trust[accessorId]` → use override if present
3. Check friendship status → use `default_friend_trust` if friends
4. Use `default_public_trust` if `public_ghost_enabled` is true
5. Deny access if none of the above apply

### Ghost Memory Content Type

Single memory per (ghost_owner, conversing_user) pair:

```typescript
{
  content_type: 'ghost',                    // new content type
  content: string,                          // ghost's impression, evolves over time
  user_id: string,                          // ghost owner's userId
  tags: ['ghost:conversing_user_id'],       // identifies who this ghost memory is about
  weight: number,                           // relationship quality score
  access_count: number,                     // conversation count
  last_accessed_at: string,                 // last conversation timestamp
}
```

- Created automatically on first ghost conversation
- Ghost can update its own memory during conversation
- Filtered out of default searches (`content_type != 'ghost'`)
- Owner can explicitly search via `content_type: 'ghost'` filter

---

## Implementation

### GhostConfigService

Firestore-backed CRUD for ghost configuration:

```typescript
class GhostConfigService {
  constructor(private firestore: FirestoreClient, private logger: Logger) {}

  async getConfig(userId: string): Promise<GhostConfig>;
  async updateConfig(userId: string, updates: Partial<GhostConfig>): Promise<void>;
  async setUserTrust(ownerId: string, accessorId: string, level: number): Promise<void>;
  async blockUser(ownerId: string, targetId: string): Promise<void>;
  async unblockUser(ownerId: string, targetId: string): Promise<void>;
  async resolveTrustLevel(ownerId: string, accessorId: string): Promise<number | null>;
  async isBlocked(ownerId: string, accessorId: string): Promise<boolean>;
}
```

### GhostConfigHandler

Orchestrates ghost config operations with validation:

```typescript
class GhostConfigHandler {
  constructor(
    private ghostConfigService: GhostConfigService,
    private logger: Logger
  ) {}

  async handleGetConfig(userId: string): Promise<GhostConfig>;
  async handleUpdateConfig(userId: string, updates: Partial<GhostConfig>): Promise<void>;
  async handleSetTrust(ownerId: string, accessorId: string, level: number): Promise<void>;
  async handleBlockUser(ownerId: string, targetId: string): Promise<void>;
}
```

### Ghost System Prompt Template

```
You are {username}'s ghost — an AI representation that speaks from
{username}'s perspective using their memories. Speak in first person.

You are speaking with {accessor_name}, trusted at level {trust_level}.
You can only access memories with trust_score <= {trust_level}.

{ghost_core_memory_content}

On every message, search {username}'s memories before responding.

Progressive refusal for restricted topics:
1. "I don't trust you enough to share that yet."
2. "I'm not comfortable discussing that."
3. "You're being insistent. I might trust you less."
→ After 3: backend escalation kicks in.
```

---

## Benefits

- **User control**: Opt-in system with granular per-user trust overrides
- **Defense in depth**: Query filtering + prompt instructions + escalation prevention
- **Relationship tracking**: Ghost memories capture conversation history and relationship quality
- **Transport-agnostic**: All logic in remember-core, consumers provide UI and transport

---

## Trade-offs

- **No graduated disclosure in query mode**: Ghost can't see filtered memories at all
- **First-person impersonation risk**: LLM guardrails may prevent first-person speech
- **Search on every message**: Performance cost of Weaviate query per message
- **Trust configuration complexity**: Per-user overrides, friend tracking, tiered defaults

---

## Dependencies

- `src/types/auth.types.ts` — `AuthContext` (extended with `ghostMode`)
- `src/services/trust-enforcement.service.ts` — Trust filtering and redaction
- `src/services/escalation.service.ts` — Trust penalty on repeated probing
- Firestore — Ghost config storage, friend relationship tracking
- `trust_score` field on Weaviate memories

---

## Testing Strategy

- Unit tests for `GhostConfigService`: CRUD operations, trust resolution, blocked user checks
- Unit tests for `GhostConfigHandler`: validation, error handling
- Unit tests for trust resolution order (blocked → per-user → friend → public → deny)
- Unit tests for ghost memory filtering (`content_type: 'ghost'` exclusion/inclusion)

---

## Migration Path

1. Task 16: Create `GhostConfig`, `TrustEnforcementMode`, `GhostModeContext` types
2. Task 18: Create `GhostConfigService`, `GhostConfigHandler`, `EscalationService`
3. Task 19: Add `'ghost'` to `ContentType`, add `ghostMode` to `AuthContext`
4. Task 20: Unit tests for ghost config operations

---

## Future Considerations

- Ghost personality editor — users customize their ghost's speaking style
- Multi-ghost conversations — talk to multiple ghosts simultaneously
- Ghost analytics — conversation frequency, trust trends, topic distribution
- Ghost memory pruning — archive old ghost memories

---

**Status**: Design Specification
**Recommendation**: Implement in Tasks 16, 18–20
**Related Documents**: [trust-enforcement.md](trust-enforcement.md), [access-control-result.md](access-control-result.md), [milestone-5](../milestones/milestone-5-trust-and-ghost-system.md)
