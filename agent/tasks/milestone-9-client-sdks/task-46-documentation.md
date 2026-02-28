# Task 46: Documentation (CHANGELOG, README, Migration Guide)

**Milestone**: M9 — Client SDKs
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: Task 44, Task 45

---

## Objective

Update all project documentation to reflect the new client SDKs and the removal of the old web SDK.

## Steps

1. Update `CHANGELOG.md`:
   - Add v0.16.0 entry
   - Document: new `./clients/svc/v1` export (29 methods), new `./app` export (5 methods)
   - Document: `./web` export removed (breaking change)
   - Document: Supabase-style `{ data, error }` + `.throwOnError()`
   - Document: auth patterns (serviceToken JWT, getAuthToken callback)
   - Document: `openapi-typescript` type generation
   - Document: `jsonwebtoken` optional peer dependency

2. Update `README.md`:
   - Replace `./web` subpath entry with `./app` and `./clients/svc/v1`
   - Add client SDK section with usage examples
   - Update exports table
   - Update test count

3. Update `docs/migration-guide.md`:
   - Add client SDK migration section
   - Before/after examples: old web SDK → new app client
   - Svc client usage examples
   - Auth configuration examples
   - Error handling pattern (SdkResponse)

4. Bump version in `package.json`: `0.15.0` → `0.16.0`

## Verification

- [ ] CHANGELOG has v0.16.0 entry covering all changes
- [ ] README reflects new exports and updated API surface
- [ ] Migration guide has clear before/after examples
- [ ] Version bumped to 0.16.0
