# Task 40: Build Svc Client — Spaces + Confirmations Resources

**Milestone**: M9 — Client SDKs
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 38

---

## Objective

Create the spaces and confirmations resource modules for the svc client.

## Steps

1. Create `src/clients/svc/v1/spaces.ts`:
   - `publish(userId, input)` → POST `/api/svc/v1/spaces/publish`
   - `retract(userId, input)` → POST `/api/svc/v1/spaces/retract`
   - `revise(userId, input)` → POST `/api/svc/v1/spaces/revise`
   - `moderate(userId, input)` → POST `/api/svc/v1/spaces/moderate`
   - `search(userId, input)` → POST `/api/svc/v1/spaces/search`
   - `query(userId, input)` → POST `/api/svc/v1/spaces/query`
   - No auto-confirm. publish/retract/revise return `{ token }`.

2. Create `src/clients/svc/v1/confirmations.ts`:
   - `confirm(userId, token)` → POST `/api/svc/v1/confirmations/:token/confirm`
   - `deny(userId, token)` → POST `/api/svc/v1/confirmations/:token/deny`

3. Write colocated test: `src/clients/svc/v1/spaces.spec.ts`

## Verification

- [ ] All 6 space methods map to correct endpoints
- [ ] Both confirmation methods map to correct endpoints
- [ ] No auto-confirm logic anywhere
- [ ] Tests pass with mocked fetch
