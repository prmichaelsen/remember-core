# Task 35: Update Docs (Migration Guide, CHANGELOG, README)

**Milestone**: M7 — Web Client SDK
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: Task 34 (tests pass)

---

## Objective

Update project documentation to cover the new `/web` subpath export. Bump version to 0.15.0 (minor — new feature).

## Context

Consumers need to know the web SDK exists, how to import it, and how it differs from the service layer. The migration guide should show how agentbase.me-style code migrates from manual orchestration to web SDK calls.

## Steps

1. Update `docs/migration-guide.md`:
   - Add "Step 5: Migrate to Web SDK" section
   - Before/after examples showing `ProfileMemoryService` → `createAndPublishProfile`
   - Before/after for manual space publish+confirm → `publishToSpace`
   - Before/after for manual ghost context resolution → `searchAsGhost`
   - WebSDKContext initialization example
   - Result pattern matching example

2. Update `CHANGELOG.md`:
   - Add `## [0.15.0]` entry
   - List all 31 new functions
   - Highlight compound operations
   - Note OpenAPI alignment

3. Update `README.md`:
   - Add `/web` to subpath imports table
   - Add "Web SDK" section with quick start
   - Update test count
   - Update export count

4. Version bump:
   - `package.json` version → `0.15.0`

5. Update `agent/progress.yaml`:
   - M7 status → completed
   - All tasks → completed
   - Add recent_work entry
   - Update next_steps

## Verification

- [ ] Migration guide has web SDK section with before/after examples
- [ ] CHANGELOG has 0.15.0 entry
- [ ] README has `/web` subpath documented
- [ ] package.json version is 0.15.0
- [ ] progress.yaml updated
- [ ] Build passes, all tests pass

## Files

- Modify: `docs/migration-guide.md`, `CHANGELOG.md`, `README.md`, `package.json`, `agent/progress.yaml`
