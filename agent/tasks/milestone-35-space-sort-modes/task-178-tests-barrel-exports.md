# Task 178: Unit Tests + Barrel Exports

**Milestone**: M35 — SpaceService Sort Modes
**Status**: Not Started
**Estimated Hours**: 3

---

## Objective

Add unit tests for all 5 new SpaceService sort modes and update barrel exports in `services/index.ts`.

---

## Context

- Existing SpaceService tests: `src/services/__tests__/space.service.spec.ts`
- Tests are colocated with source using `.spec.ts` suffix
- Jest config: `config/jest.config.js`
- Existing sort mode test patterns: `src/services/__tests__/memory.service.spec.ts`

---

## Steps

### 1. Update barrel exports in `src/services/index.ts`

Add new type exports from `space.service.js`:

```typescript
export {
  // ... existing exports ...
  type TimeSpaceInput,
  type TimeSpaceResult,
  type RatingSpaceInput,
  type RatingSpaceResult,
  type PropertySpaceInput,
  type PropertySpaceResult,
  type BroadSpaceInput,
  type BroadSpaceResult,
  type RandomSpaceInput,
  type RandomSpaceResult,
} from './space.service.js';
```

### 2. Add tests for each sort mode

Add tests to the existing space service spec file. Each sort mode needs:

**byTime tests:**
- Sorts by created_at descending (default)
- Sorts ascending when direction='asc'
- Searches across spaces + groups
- Deduplicates cross-collection results
- Validates invalid space IDs
- Validates invalid group IDs
- Moderation permission check for non-approved filter

**byRating tests:**
- Sorts by rating_bayesian descending (default)
- Searches across multiple collections
- Handles missing rating_bayesian (defaults to 0)

**byProperty tests:**
- Sorts by specified property
- Rejects invalid sort_field
- Re-sorts merged results correctly

**byBroad tests:**
- Returns truncated content (head/mid/tail)
- Includes significance scores when present
- Searches across spaces + groups

**byRandom tests:**
- Returns random sample from pool
- Respects limit parameter
- Returns total_pool_size across all collections
- Handles empty collections gracefully

**Shared validation tests (can cover all modes):**
- Invalid space ID throws ValidationError
- Invalid group ID throws ValidationError
- Non-approved moderation_filter without moderator access throws ForbiddenError

### 3. Verify all existing tests pass

Run full test suite to ensure no regressions.

---

## Verification

- [ ] All 5 sort mode type interfaces exported from `services/index.ts`
- [ ] byTime tests: direction, cross-collection, dedupe, validation
- [ ] byRating tests: sort order, cross-collection, missing ratings
- [ ] byProperty tests: valid field, invalid field, cross-collection re-sort
- [ ] byBroad tests: content truncation, significance scores
- [ ] byRandom tests: sampling, pool size, empty collection
- [ ] Shared validation tests cover all modes
- [ ] All existing tests still pass (no regressions)
- [ ] `npm test` passes clean
