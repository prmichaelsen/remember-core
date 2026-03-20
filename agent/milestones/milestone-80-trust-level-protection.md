# Milestone 80: Trust Level Protection

**Goal**: Make trust level changes intentional by defaulting all new memories to SECRET (5) and requiring a confirmation token to change trust levels
**Duration**: 0.5 weeks
**Dependencies**: None
**Status**: Not Started

---

## Overview

Currently, trust levels can be set casually during memory creation or updates. This creates risk of agents accidentally setting the wrong trust level, potentially exposing confidential memories. This milestone hardens trust level management:

1. **All new memories default to SECRET (5)** — the `trust` field is removed from `CreateMemoryInput`. No override allowed.
2. **Trust cannot be changed via `update()`** — the `trust` field is removed from `UpdateMemoryInput`. Attempting to set it throws an error.
3. **New `requestSetTrustLevel()` / `confirmSetTrustLevel()` flow** — the only way to change a memory's trust level, requiring a confirmation token (5-minute expiry, one-time use).

This ensures users are extremely intentional about trust level changes and that agents never accidentally set the wrong trust level.

---

## Deliverables

### 1. Remove trust from create/update paths
- Remove `trust` from `CreateMemoryInput`
- Hardcode `trust_score: TrustLevel.SECRET` in `MemoryService.create()`
- Remove `trust` from `UpdateMemoryInput`
- Remove trust handling from `MemoryService.update()`, throw error if attempted

### 2. New set-trust-level confirmation flow
- `SetTrustLevelInput` and `SetTrustLevelResult` types
- `MemoryService.requestSetTrustLevel(input)` — validates input, creates confirmation token via `ConfirmationTokenService`
- `MemoryService.confirmSetTrustLevel(token)` — validates token, applies trust level change to Weaviate
- `ConfirmationTokenService` added as optional constructor param on `MemoryService`

### 3. Tests
- Unit tests: create defaults to SECRET, update rejects trust, request/confirm flow
- Existing tests updated to remove trust-on-create/update assertions

### 4. OpenAPI + SVC Client
- New endpoint: `POST /api/svc/v1/memories/:id/request-set-trust-level`
- Confirmation via existing `POST /api/svc/v1/confirmations/:token/confirm`
- SVC client: `client.memories.requestSetTrustLevel(userId, input)`
- OpenAPI spec updated

---

## Success Criteria

- [ ] `CreateMemoryInput` has no `trust` field; all new memories get trust_score = 5
- [ ] `UpdateMemoryInput` has no `trust` field; `update()` throws if trust provided
- [ ] `requestSetTrustLevel()` returns confirmation token
- [ ] `confirmSetTrustLevel()` applies trust change after token validation
- [ ] Expired/invalid tokens are rejected
- [ ] All existing tests pass (updated for new defaults)
- [ ] New unit tests cover the confirmation flow
- [ ] OpenAPI spec documents new endpoint
- [ ] SVC client exposes new method

---

## Architecture

### Confirmation Flow

```
User/Agent                    MemoryService                    ConfirmationTokenService
    │                              │                                    │
    │  requestSetTrustLevel()      │                                    │
    │─────────────────────────────>│                                    │
    │                              │  createRequest('set_trust_level',  │
    │                              │    { memory_id, trust_level })     │
    │                              │───────────────────────────────────>│
    │                              │                     { token }      │
    │                              │<───────────────────────────────────│
    │          { token }           │                                    │
    │<─────────────────────────────│                                    │
    │                              │                                    │
    │  confirmSetTrustLevel(token) │                                    │
    │─────────────────────────────>│                                    │
    │                              │  confirmRequest(token)             │
    │                              │───────────────────────────────────>│
    │                              │      { payload: { memory_id,      │
    │                              │        trust_level } }             │
    │                              │<───────────────────────────────────│
    │                              │                                    │
    │                              │  [apply trust_score update         │
    │                              │   to Weaviate]                     │
    │                              │                                    │
    │     { updated }              │                                    │
    │<─────────────────────────────│                                    │
```

### Key Decisions

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| Default trust on create | SECRET (5) | Maximum protection by default — users must explicitly lower |
| Trust on update | Removed entirely | Single path for trust changes reduces accident surface |
| Confirmation mechanism | Reuse ConfirmationTokenService | Already proven in SpaceService publish/retract/revise |
| ConfirmationTokenService injection | Optional constructor param | Backward-compatible — only needed if set-trust-level is used |
| Internal callers (REM, Import, MoodSync) | Also get SECRET (5) | Consistent behavior — no bypass |

---

## Tasks

| ID | Name | Est. Hours | Dependencies |
|----|------|-----------|-------------|
| task-530 | Remove trust from create/update + hardcode SECRET | 2 | None |
| task-531 | Add requestSetTrustLevel / confirmSetTrustLevel | 3 | task-530 |
| task-532 | Unit tests for trust level protection | 2 | task-531 |
| task-533 | OpenAPI spec + SVC client updates | 2 | task-531 |

**Total estimated**: 9 hours (~0.5 weeks)
