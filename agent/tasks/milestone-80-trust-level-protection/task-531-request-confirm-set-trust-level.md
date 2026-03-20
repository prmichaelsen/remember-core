# Task 531: Add requestSetTrustLevel / confirmSetTrustLevel

**Milestone**: M80 — Trust Level Protection
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: task-530

---

## Objective

Add two new methods to `MemoryService` that implement a confirmation-token-gated trust level change. This is the only way to change a memory's trust level.

---

## Steps

### 1. Add ConfirmationTokenService to MemoryService constructor

Update the `options` param to include an optional `confirmationTokenService`:

```typescript
private options: {
  memoryIndex: MemoryIndexService;
  weaviateClient?: any;
  recommendationService?: RecommendationService;
  confirmationTokenService?: ConfirmationTokenService;
},
```

### 2. Define input/output types

```typescript
export interface SetTrustLevelInput {
  memory_id: string;
  trust_level: number; // 1-5 integer
}

export interface SetTrustLevelRequestResult {
  token: string;
  memory_id: string;
  requested_trust_level: number;
  current_trust_level: number;
  expires_at: string;
}

export interface SetTrustLevelConfirmResult {
  memory_id: string;
  previous_trust_level: number;
  new_trust_level: number;
  updated_at: string;
  version: number;
}
```

### 3. Implement `requestSetTrustLevel(input: SetTrustLevelInput)`

- Validate `confirmationTokenService` is configured (throw if not)
- Validate `input.trust_level` with `isValidTrustLevel()`
- Fetch memory, verify ownership, verify not deleted
- Read current `trust_score`
- If current equals requested, throw `'Trust level is already set to ${trust_level}'`
- Call `confirmationTokenService.createRequest(userId, 'set_trust_level', { memory_id, trust_level, current_trust_level })`
- Return `SetTrustLevelRequestResult`

### 4. Implement `confirmSetTrustLevel(token: string)`

- Validate `confirmationTokenService` is configured (throw if not)
- Call `confirmationTokenService.confirmRequest(userId, token)`
- If null, throw `'Invalid or expired confirmation token'`
- Verify action is `'set_trust_level'`
- Extract `memory_id` and `trust_level` from payload
- Fetch memory, verify ownership, verify not deleted
- Apply update: `trust_score = trust_level`, bump version, set `updated_at`
- Use `collection.data.replace()` (same pattern as `update()`)
- Return `SetTrustLevelConfirmResult`

### 5. Export new types from barrel

Add to `src/services/index.ts`:
- `SetTrustLevelInput`
- `SetTrustLevelRequestResult`
- `SetTrustLevelConfirmResult`

---

## Verification

- [ ] `requestSetTrustLevel()` creates confirmation token with correct payload
- [ ] `requestSetTrustLevel()` throws if trust_level invalid
- [ ] `requestSetTrustLevel()` throws if memory not found / unauthorized / deleted
- [ ] `requestSetTrustLevel()` throws if trust already at requested level
- [ ] `requestSetTrustLevel()` throws if confirmationTokenService not configured
- [ ] `confirmSetTrustLevel()` validates and applies trust change
- [ ] `confirmSetTrustLevel()` throws on invalid/expired token
- [ ] `confirmSetTrustLevel()` throws on wrong action type
- [ ] Version is bumped, updated_at is set
- [ ] New types exported from barrel
