# Task 58: Fix Weaviate Sort API Crash in byTime and byDensity

**Milestone**: [M11 - Basic Sort Modes](../../milestones/milestone-11-basic-sort-modes.md)
**Estimated Time**: 1-2 hours
**Dependencies**: Task 36, Task 40
**Status**: Not Started

---

## Objective

Fix `TypeError: Cannot read properties of undefined (reading 'map')` that crashes `byTime()` and `byDensity()` in production when the Weaviate client's `fetchObjects` serializer tries to read `.sorts` from a plain array.

---

## Context

Both `MemoryService.byTime()` and `MemoryService.byDensity()` pass a plain array to `fetchObjects({ sort: [...] })`:

```typescript
// Current (broken)
sort: [{ property: 'created_at', order: 'desc' }]
```

The weaviate-client SDK serializer at `collections/serialize/index.js:366` does:

```js
sortBy: args?.sort ? Search.sortBy(args.sort.sorts) : undefined
```

It expects `sort` to be a `Sorting` instance (which has a `.sorts` array), not a plain array. So `args.sort.sorts` is `undefined` and `.map()` crashes.

**Production stack trace:**
```
TypeError: Cannot read properties of undefined (reading 'map')
    at Search.sortBy (weaviate-client/collections/serialize/index.js:314:21)
    at Search.fetchObjects (weaviate-client/collections/serialize/index.js:366:41)
    at MemoryService.retryWithoutDeletedFilter (remember-core/services/memory.service.js:38:20)
    at MemoryService.byTime (remember-core/services/memory.service.js:185:25)
```

**Correct weaviate SDK sort usage:**
```typescript
// The collection.sort builder returns a Sorting instance with .sorts property
collection.sort.byProperty('created_at', false)  // false = descending
// Sorting { sorts: [{ property: 'created_at', ascending: false }] }
```

---

## Steps

### 1. Fix byTime sort

In `src/services/memory.service.ts`, change the `byTime` query options from:

```typescript
sort: [{ property: 'created_at', order: direction }]
```

To use the weaviate SDK sort builder:

```typescript
sort: this.collection.sort.byProperty('created_at', direction === 'asc')
```

### 2. Fix byDensity sort

Same file, change `byDensity` from:

```typescript
sort: [{ property: 'relationship_count', order: 'desc' }]
```

To:

```typescript
sort: this.collection.sort.byProperty('relationship_count', false)
```

### 3. Verify locally

Run the existing unit tests for byTime and byDensity to confirm they still pass with the new sort builder usage.

### 4. Publish patch

Bump patch version and publish so remember-rest-service can pick up the fix.

---

## Verification

- [ ] `byTime()` uses `collection.sort.byProperty()` instead of plain array
- [ ] `byDensity()` uses `collection.sort.byProperty()` instead of plain array
- [ ] Unit tests pass
- [ ] Deployed REST service no longer returns 500 on `/memories/by-time`
- [ ] Deployed REST service no longer returns 500 on `/memories/by-density`

---

## Key Files

- `src/services/memory.service.ts` — byTime (~line 361) and byDensity (~line 432) sort options
- `node_modules/weaviate-client/dist/node/esm/collections/serialize/index.js:366` — SDK expects `sort.sorts`
- `node_modules/weaviate-client/dist/node/esm/collections/sort/classes.js` — `Sorting` class with `.sorts` array

---

## Notes

- This is a **production blocker** — the chronological feed on agentbase.me is broken
- The weaviate-client SDK's `fetchObjects` serializer expects `sort` to be a `Sorting` object, not a raw array
- The `Sorting` class uses `ascending: boolean` (not `order: 'asc'|'desc'`), so `'desc'` maps to `ascending: false`
- The `collection.sort` factory is available on any collection instance

---

**Related Design Docs**: None
**Estimated Completion Date**: 2026-03-03 (urgent)
