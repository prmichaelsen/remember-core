# Task 110: Documentation

**Milestone**: [M20 - Memory Ratings System](../../milestones/milestone-20-memory-ratings-system.md)
**Estimated Time**: 1-2 hours
**Dependencies**: [Task 109](task-109-unit-tests.md)
**Status**: Not Started

---

## Objective

Update CHANGELOG, README, and migration guide with Memory Ratings documentation. Bump version.

---

## Context

Follow existing documentation patterns from previous milestones. Version bump follows semver (minor version for new feature).

---

## Steps

### 1. Update CHANGELOG.md

Add new version entry:

```markdown
## [0.31.0] - YYYY-MM-DD

### Added
- **Memory Ratings System** (M20)
  - RatingService: rate, retract, getUserRating with Firestore individual ratings + Weaviate aggregates
  - byRating sort mode on MemoryService (Bayesian averaging)
  - 3 new Memory properties: rating_sum, rating_count, rating_bayesian
  - Derived rating_avg (null when < 5 ratings)
  - REST endpoints: PUT/DELETE/GET /api/svc/v1/memories/:id/rating
  - SVC client: memories.rate(), retractRating(), getMyRating()
  - Self-rating and ghost-mode rating prevention
  - N new tests (X total, Y suites)
```

### 2. Update README.md

- Add Rating Service to services table/section
- Add byRating to sort modes list
- Update test count
- Update version

### 3. Update Migration Guide

Add rating section to `docs/migration-guide.md`:
- RatingService usage example (rate, retract, getUserRating)
- byRating sort mode usage
- REST endpoint reference
- SVC client usage

### 4. Bump Version

Update `package.json` version to `0.31.0`.

---

## Verification

- [ ] CHANGELOG has complete entry for new version
- [ ] README reflects new services, sort modes, test count
- [ ] Migration guide has rating examples
- [ ] Version bumped in package.json
- [ ] No stale references to old test counts

---

**Related Design Docs**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)
