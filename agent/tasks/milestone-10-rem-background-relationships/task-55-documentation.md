# Task 55: Documentation — CHANGELOG, README

**Milestone**: [M10 - REM Background Relationships](../../milestones/milestone-10-rem-background-relationships.md)
**Estimated Time**: 2 hours
**Dependencies**: [Task 54](task-54-rem-unit-tests.md)
**Status**: Not Started

---

## Objective

Update CHANGELOG, README, and progress.yaml to document M10 completion. Add REM to the subpath exports if appropriate.

---

## Context

Standard documentation task following project conventions. Covers the new REM module, schema changes, and service extensions.

---

## Steps

### 1. Update CHANGELOG.md

Add version entry (e.g., 0.17.0) covering:
- New `source` field on Relationship type
- `RelationshipService.findByMemoryIds()` method
- New `src/rem/` module with RemService
- Collection enumeration utility
- Firestore REM state tracking
- Haiku validation client
- Test count update

### 2. Update README.md

- Add REM section describing the background relationship engine
- Update test count
- Update architecture section if needed
- Note the `source` field on relationships

### 3. Update progress.yaml

- Add M10 milestone entry with all tasks
- Update version to 0.17.0
- Add recent_work entry
- Update progress percentages

### 4. Consider subpath export

Decide whether `src/rem/` gets its own subpath export (`./rem`). Likely yes — Cloud Run consumer needs to import `RemService`:

```json
"./rem": {
  "types": "./dist/rem/index.d.ts",
  "import": "./dist/rem/index.js"
}
```

Update package.json exports and typesVersions if adding.

### 5. Version bump

Bump package.json version to 0.17.0.

---

## Verification

- [ ] CHANGELOG.md has 0.17.0 entry
- [ ] README.md updated with REM section
- [ ] progress.yaml updated with M10 milestone and tasks
- [ ] Test count accurate in README
- [ ] Version bumped to 0.17.0
- [ ] Subpath export decision made and implemented (if yes)
- [ ] Build compiles

---

**Related Design Docs**: [REM Design](../../design/local.rem-background-relationships.md)
