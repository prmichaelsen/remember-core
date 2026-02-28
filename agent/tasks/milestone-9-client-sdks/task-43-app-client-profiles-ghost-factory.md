# Task 43: Build App Client — Profiles + Ghost + Factory

**Milestone**: M9 — Client SDKs
**Status**: Not Started
**Estimated Hours**: 4
**Dependencies**: Task 38

---

## Objective

Create the app client with compound use-case operations (profiles, ghost) and the `createAppClient` factory.

## Steps

1. Create `src/app/profiles.ts`:
   - `createAndPublishProfile(userId, input)` → POST `/api/app/v1/profiles/create-and-publish`
   - `searchProfiles(userId, input)` → POST `/api/app/v1/profiles/search`
   - `retractProfile(userId, input)` → POST `/api/app/v1/profiles/retract`
   - `updateAndRepublishProfile(userId, input)` → POST `/api/app/v1/profiles/update-and-republish`
   - All return `SdkResponse<T>` — no auto-confirm

2. Create `src/app/ghost.ts`:
   - `searchAsGhost(userId, input)` → POST `/api/app/v1/ghost/search`
   - Returns `SdkResponse<T>`

3. Create `src/app/index.ts`:
   - `createAppClient(config: HttpClientConfig)` factory
   - Calls `assertServerSide()`
   - Returns object with:
     ```typescript
     {
       profiles: ProfilesResource,
       ghost: GhostResource,
     }
     ```
   - Re-exports all types from `types.generated.ts`

4. Write colocated tests:
   - `src/app/profiles.spec.ts`
   - `src/app/index.spec.ts`

## Verification

- [ ] All 4 profile methods map to correct `/api/app/v1/` endpoints
- [ ] `searchAsGhost` maps to correct endpoint
- [ ] `createAppClient` returns both resource groups
- [ ] App client does NOT call svc client internally
- [ ] No auto-confirm logic
- [ ] Tests pass with mocked fetch
