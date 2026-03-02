# Task 48: Schema — Add source field to Relationship type and Weaviate schema

**Milestone**: [M10 - REM Background Relationships](../../milestones/milestone-10-rem-background-relationships.md)
**Estimated Time**: 2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Add a `source` field to the Relationship type and Weaviate schema so relationships can be attributed to their creator: `'user'` (manual), `'rem'` (background engine), or `'rule'` (future automoderation).

---

## Context

REM-created relationships need to be distinguishable from user-created ones. The `source` field enables future filtering by origin. No migration needed — collections are recreated on hard cutover. New relationships default to `source: 'user'` when not specified.

---

## Steps

### 1. Update Relationship type in memory.types.ts
Add `source` field to the `Relationship` interface:
```typescript
source: 'user' | 'rem' | 'rule';
```

Export `RelationshipSource` type alias.

### 2. Update Weaviate schema in v2-collections.ts
Add `source` property to `COMMON_MEMORY_PROPERTIES`:
```typescript
{ name: 'source', dataType: configure.dataType.TEXT }
```

### 3. Update ALL_MEMORY_PROPERTIES in client.ts
Add `'source'` to the constant array.

### 4. Update RelationshipService.create()
Default `source` to `'user'` in `create()` when not provided. Accept optional `source` in `CreateRelationshipInput`.

### 5. Update barrel exports
Export `RelationshipSource` from `types/index.ts`.

---

## Verification

- [ ] `Relationship` interface includes `source: RelationshipSource`
- [ ] `RelationshipSource = 'user' | 'rem' | 'rule'` exported from types
- [ ] Weaviate schema includes `source` TEXT property
- [ ] `ALL_MEMORY_PROPERTIES` includes `'source'`
- [ ] `CreateRelationshipInput` accepts optional `source` (defaults to `'user'`)
- [ ] `npm run build` compiles
- [ ] Existing tests pass

---

**Next Task**: [Task 49: RelationshipService extension — findByMemoryIds](task-49-relationship-service-find-by-memory-ids.md)
**Related Design Docs**: [REM Design](../../design/local.rem-background-relationships.md) (Source Field section)
