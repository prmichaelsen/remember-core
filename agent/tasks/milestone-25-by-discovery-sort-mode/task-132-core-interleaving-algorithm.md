# Task 132: Core Interleaving Algorithm

**Milestone**: M25 — byDiscovery Sort Mode
**Estimated Time**: 1-2 hours
**Dependencies**: None (pure algorithm, no service dependencies)
**Status**: Not Started

---

## Objective

Implement the `interleaveDiscovery()` function that merges a rated pool and a discovery pool at a 4:1 ratio, tagging each item with `is_discovery`.

---

## Context

The byDiscovery sort mode needs a reusable interleaving function that:
- Takes two arrays (rated items sorted by Bayesian, discovery items sorted by recency)
- Merges them at a fixed 4:1 ratio (every 5th item from discovery pool)
- Tags each item with `is_discovery: boolean`
- Handles pool exhaustion gracefully (fills from the other pool)
- Supports offset/limit on the merged result

---

## Steps

### 1. Create discovery utility module

Create `src/services/discovery.ts` (or add to existing sort-mode utilities).

### 2. Implement `interleaveDiscovery()`

```typescript
interface InterleaveOptions<T> {
  rated: T[];
  discovery: T[];
  ratio?: number; // default 4
  offset?: number;
  limit?: number;
}

interface DiscoveryItem<T> {
  item: T;
  is_discovery: boolean;
}

function interleaveDiscovery<T>(options: InterleaveOptions<T>): DiscoveryItem<T>[];
```

Algorithm:
1. Walk through positions 0..N
2. If `(position + 1) % (ratio + 1) === 0` → take from discovery pool
3. Otherwise → take from rated pool
4. If target pool exhausted → take from other pool
5. Apply offset/limit to merged result

### 3. Add `SortMode` enum update

Add `'byDiscovery'` to the `SortMode` type wherever it's defined.

### 4. Export from appropriate subpath

Ensure the function is accessible from services that need it.

---

## Verification

- [ ] `interleaveDiscovery()` function implemented and exported
- [ ] Handles empty rated pool (100% discovery)
- [ ] Handles empty discovery pool (100% rated)
- [ ] Handles both pools empty (empty result)
- [ ] Offset/limit work correctly on merged result
- [ ] `is_discovery` flag set correctly
- [ ] `byDiscovery` added to SortMode type
