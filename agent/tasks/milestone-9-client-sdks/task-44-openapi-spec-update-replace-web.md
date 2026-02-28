# Task 44: Update OpenAPI Spec + Replace src/web/ + Package.json Exports

**Milestone**: M9 — Client SDKs
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 42, Task 43

---

## Objective

Update the OpenAPI spec for the app tier, remove the old `src/web/` code, and update package.json exports.

## Steps

1. Update `docs/openapi-web.yaml`:
   - Rename tier from `web` → `app` (paths: `/api/web/v1/` → `/api/app/v1/`)
   - Remove "confirmation-free" language from descriptions
   - Add confirmation token returns to space operations (publish, retract, revise return `{ token }`)
   - Update title/description to reflect "App Client SDK"

2. Regenerate types:
   - Run `npx openapi-typescript docs/openapi-web.yaml -o src/app/types.generated.ts`

3. Remove `src/web/` directory:
   - Delete all files (result.ts, errors.ts, guard.ts, context.ts, memories.ts, relationships.ts, spaces.ts, ghost.ts, profiles.ts, preferences.ts, types.ts, index.ts, testing-helpers.ts)
   - Keep `src/clients/guard.ts` (reuses the assertServerSide logic)

4. Update `package.json`:
   - Remove `./web` export
   - Add `./app` export pointing to `dist/app/index.js` / `src/app/index.ts`
   - Add `./clients/svc/v1` export pointing to `dist/clients/svc/v1/index.js` / `src/clients/svc/v1/index.ts`
   - Update `typesVersions` accordingly
   - Add `openapi-typescript` to devDependencies
   - Add `jsonwebtoken` as optional peerDependency

5. Update `tsconfig.json` if needed for new paths

## Verification

- [ ] `openapi-web.yaml` uses `/api/app/v1/` paths
- [ ] No "confirmation-free" language remains
- [ ] `src/web/` directory removed
- [ ] `./app` and `./clients/svc/v1` exports work
- [ ] `./web` export removed
- [ ] `npm run build` compiles successfully
