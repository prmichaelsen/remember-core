# Task 33: Preferences Use Cases + Barrel Exports + Subpath Config

**Milestone**: M7 — Web Client SDK
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: Task 27 (WebSDKContext)

---

## Objective

Implement the preferences use cases, create the barrel export file for the web module, and configure the `@prmichaelsen/remember-core/web` subpath export in package.json.

## Context

This task ties together all the use-case modules into a single importable subpath. The preferences module is simple (2 functions), so it's bundled with the packaging work.

## Steps

1. Create `src/web/preferences.ts` with 2 functions:
   - `getPreferences(ctx)` → `Result<UserPreferences>`
   - `updatePreferences(ctx, input)` → `Result<UserPreferences>`
   - Delegates to `PreferencesDatabaseService`

2. Create `src/web/index.ts` barrel:
   - Re-export all functions from memories, relationships, spaces, ghost, profiles, preferences
   - Re-export types: Result, WebSDKError, ErrorKind, WebSDKContext, PaginatedResult, all result types
   - Re-export factories: createWebSDKContext, ok, err, tryCatch, createError
   - Call `assertServerSide()` at module scope (top-level side effect)

3. Update `package.json`:
   - Add `"./web"` to `exports` map pointing to `dist/web/index.js` + types
   - Add `"./web"` to `typesVersions` for backwards-compat type resolution

4. Update `tsconfig.json` if needed to include `src/web/` in compilation

5. Verify: `import { createAndPublishProfile } from '@prmichaelsen/remember-core/web'` resolves

## Verification

- [ ] `src/web/index.ts` exports all 31 use-case functions
- [ ] `src/web/index.ts` exports all types
- [ ] `assertServerSide()` runs at import time
- [ ] `package.json` `exports["./web"]` configured correctly
- [ ] `typesVersions` updated for backwards compat
- [ ] Build produces `dist/web/index.js` and `dist/web/index.d.ts`
- [ ] Subpath import resolves correctly

## Files

- Create: `src/web/preferences.ts`, `src/web/index.ts`
- Modify: `package.json` (exports, typesVersions)
