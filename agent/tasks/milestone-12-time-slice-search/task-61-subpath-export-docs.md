# Task 61: Subpath Export and Documentation

**Milestone**: M12 — Time-Slice Search
**Status**: Complete
**Estimated Hours**: 1
**Dependencies**: [Task 60](./task-60-search-by-time-slice.md)

---

## Objective

Add `remember-core/search` as a new subpath export, update package.json, and update documentation (CHANGELOG, README).

---

## Steps

### 1. Update `package.json`

Add to `exports`:
```json
"./search": {
  "types": "./dist/search/index.d.ts",
  "import": "./dist/search/index.js"
}
```

Add to `typesVersions`:
```json
"search": ["dist/search/index.d.ts"]
```

### 2. Verify build

- `npm run build` — dist/search/ outputs .js + .d.ts
- `npm test` — all tests pass

### 3. Update CHANGELOG.md

Add entry for new version:
```markdown
## [X.Y.Z] - 2026-03-03

### Added
- `remember-core/search` subpath export with time-slice search utilities
- `searchByTimeSlice()` — combines text search with chronological ordering via parallel time-bucketed searches
- `buildGradedSlices()` — 14 exponentially-spaced buckets for newest-first
- `buildEvenSlices()` — N equal-width buckets for oldest-first
```

### 4. Update README.md

- Add `./search` to subpath exports table
- Brief description of `searchByTimeSlice` with usage example

### 5. Version bump

Patch or minor bump as appropriate. This is a new feature (minor).

---

## Verification

- [ ] `remember-core/search` import resolves correctly
- [ ] Build produces dist/search/ with .js and .d.ts files
- [ ] CHANGELOG has new entry
- [ ] README subpath table updated
- [ ] Version bumped
- [ ] All tests pass
