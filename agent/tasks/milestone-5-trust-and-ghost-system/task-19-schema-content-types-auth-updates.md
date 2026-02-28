# Task 19: Update Schema, Content Types, and AuthContext

**Milestone**: [M5 - Trust & Ghost System](../../milestones/milestone-5-trust-and-ghost-system.md)
**Estimated Time**: 2 hours
**Dependencies**: Task 16 (types)
**Status**: Not Started

---

## Objective

Update existing modules with new ACL fields, moderation fields, content types, and AuthContext extensions needed by the trust & ghost system.

---

## Steps

### 1. Update `src/database/weaviate/v2-collections.ts`

Add 7 new properties to `PUBLISHED_MEMORY_PROPERTIES`:

```typescript
// ACL fields
{ name: 'write_mode', dataType: configure.dataType.TEXT },
{ name: 'overwrite_allowed_ids', dataType: configure.dataType.TEXT_ARRAY },
{ name: 'last_revised_by', dataType: configure.dataType.TEXT },
{ name: 'owner_id', dataType: configure.dataType.TEXT },

// Moderation fields
{ name: 'moderation_status', dataType: configure.dataType.TEXT },
{ name: 'moderated_by', dataType: configure.dataType.TEXT },
{ name: 'moderated_at', dataType: configure.dataType.DATE },
```

### 2. Update `src/constants/content-types.ts`

Add two new content types:
- `'ghost'` — Ghost persona memory tracking cross-user relationship quality
  - Category: personal (or new category)
  - Description: "Ghost persona memory — tracks relationship quality between ghost owner and conversing user"
- `'comment'` — Comment on a published memory
  - Category: reference
  - Description: "Comment on a published memory in a space or group"

Update the `ContentType` union type, metadata registry, and category groupings.

### 3. Update `src/types/auth.types.ts`

- Add `can_moderate: boolean` to `GroupPermissions` interface
- Verify `ghostMode?: GhostModeContext` was added in Task 16

### 4. Update `src/types/memory.types.ts`

Add optional ACL fields to the published memory type (if separate from base Memory):
- `write_mode?: string`
- `overwrite_allowed_ids?: string[]`
- `last_revised_by?: string`
- `owner_id?: string`
- `moderation_status?: string`
- `moderated_by?: string`
- `moderated_at?: string`

### 5. Add moderation filter utilities

Add to `src/utils/filters.ts`:
- `buildModerationFilter(collection, status?)` — default: approved or null (backward compat)
- Moderator override: allow filtering by pending/rejected/removed/all

---

## Verification

- [ ] `npm run build` succeeds
- [ ] All existing tests pass
- [ ] New content types appear in exports
- [ ] `can_moderate` is on GroupPermissions
- [ ] ACL fields are in PUBLISHED_MEMORY_PROPERTIES
- [ ] Moderation filter builder works with mock collection

---

**Source Files**: `remember-mcp/src/schema/v2-collections.ts`, `remember-mcp/src/constants/content-types.ts`, `remember-mcp/src/types/auth.ts`
**Related Design Docs**: [memory-acl-schema.md](../../design/memory-acl-schema.md)
**Next Task**: [Task 20](task-20-trust-ghost-unit-tests.md)
