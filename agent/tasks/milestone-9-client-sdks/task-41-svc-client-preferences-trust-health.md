# Task 41: Build Svc Client — Preferences + Trust + Health Resources

**Milestone**: M9 — Client SDKs
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 38

---

## Objective

Create the preferences, trust, and health resource modules for the svc client.

## Steps

1. Create `src/clients/svc/v1/preferences.ts`:
   - `get(userId, input)` → GET `/api/svc/v1/preferences`
   - `update(userId, input)` → PATCH `/api/svc/v1/preferences`

2. Create `src/clients/svc/v1/trust.ts`:
   - `getConfig(userId)` → GET `/api/svc/v1/trust/config`
   - `updateConfig(userId, input)` → PATCH `/api/svc/v1/trust/config`
   - `setUserTrust(userId, input)` → POST `/api/svc/v1/trust/set`
   - `removeUserTrust(userId, input)` → POST `/api/svc/v1/trust/remove`
   - `blockUser(userId, input)` → POST `/api/svc/v1/trust/block`
   - `unblockUser(userId, input)` → POST `/api/svc/v1/trust/unblock`
   - `checkAccess(userId, input)` → POST `/api/svc/v1/trust/check-access`

3. Create `src/clients/svc/v1/health.ts`:
   - `check()` → GET `/api/svc/v1/health`
   - `ready()` → GET `/api/svc/v1/health/ready`

4. Write colocated test: `src/clients/svc/v1/trust.spec.ts`

## Verification

- [ ] Both preference methods map to correct endpoints
- [ ] All 7 trust methods map to correct endpoints
- [ ] Both health methods map to correct endpoints (no userId required)
- [ ] Tests pass with mocked fetch
