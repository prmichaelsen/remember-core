# Task 25: Update Migration Guide and Documentation

**Milestone**: [M6 - Ghost/Trust Integration](../../milestones/milestone-6-ghost-memory-service-integration.md)
**Estimated Time**: 1 hour
**Dependencies**: Task 24
**Status**: Not Started

---

## Objective

Update the migration guide to document ghost_context parameter on MemoryService methods. Update CHANGELOG and README with M6 changes.

---

## Steps

### 1. Update docs/migration-guide.md

Add section: "Ghost-Integrated Memory Search"

Before (remember-mcp inline):
```typescript
// In search-memory.ts handler:
const ghostMode = authContext?.ghostMode;
const trustFilter = ghostMode
  ? buildTrustFilter(collection, ghostMode.accessor_trust_level)
  : null;
const ghostExclusionFilter = collection.filter.byProperty('content_type').notEqual('ghost');
// ... manually combine filters, run Weaviate query ...
```

After (remember-core):
```typescript
const { memory } = createCoreServices(userId);
const result = await memory.search({
  query: args.query,
  ghost_context: authContext?.ghostMode ? {
    accessor_trust_level: authContext.ghostMode.accessor_trust_level,
    owner_user_id: authContext.ghostMode.owner_user_id,
  } : undefined,
});
```

Add mapping for deferred tools:
| Tool | Core Method | Notes |
|------|-------------|-------|
| search_memory | `MemoryService.search()` with `ghost_context` | Was deferred in M17 |
| query_memory | `MemoryService.query()` with `ghost_context` | Was deferred in M17 |
| ghost_config | Direct imports from core | No MemoryService changes needed |

### 2. Update CHANGELOG.md

Add v0.14.0 entry:
- Added `GhostSearchContext` type
- Added `ghost_context` parameter to `SearchMemoryInput`, `QueryMemoryInput`, `FindSimilarInput`
- MemoryService now applies trust filtering and ghost exclusion when ghost_context provided

### 3. Update README.md

Update feature list to mention ghost-integrated search.

---

## Verification

- [ ] Migration guide has before/after examples for ghost search
- [ ] CHANGELOG has v0.14.0 entry
- [ ] README updated
- [ ] All links valid
