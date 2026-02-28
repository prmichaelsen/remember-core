# Memory ACL Schema

**Concept**: Per-memory access control fields and write mode permission resolution
**Created**: 2026-02-28
**Status**: Design Specification

---

## Overview

Defines four new Weaviate fields on published memories that enable fine-grained write control: `write_mode`, `overwrite_allowed_ids`, `last_revised_by`, and `owner_id`. Includes permission resolution logic (`canRevise()`, `canOverwrite()`) and revision history format updates. Also covers moderation status fields and per-space configuration.

Adapted from remember-mcp's `local.memory-acl-schema.md` and `local.moderation-and-space-config.md` for the remember-core SDK.

---

## Problem Statement

- Published memories currently have no write access controls beyond ownership.
- Collaborative editing (wiki-style, group editors) requires per-memory write mode settings.
- Ownership transfer needs a separate `owner_id` field distinct from `author_id`.
- Revision history lacks attribution — can't tell who made which revision.
- Moderation workflow requires status tracking and moderator-only search visibility.
- Per-space configuration (moderation policy, default write mode) is needed but not schema-embedded.

---

## Solution

### New ACL Fields on Published Memories

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `write_mode` | text | null → `"owner_only"` | Controls who can revise |
| `overwrite_allowed_ids` | text[] | `[]` | Per-memory explicit overwrite grants (user IDs) |
| `last_revised_by` | text | null | User ID of last reviser (conflict detection) |
| `owner_id` | text | null → `author_id` | Supports ownership transfer |

### Moderation Fields on Published Memories

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `moderation_status` | text | null → `"approved"` | `pending` / `approved` / `rejected` / `removed` |
| `moderated_by` | text | null | userId of last moderator action |
| `moderated_at` | date | null | Timestamp of last moderation action |

### Write Mode Semantics

| Value | Who Can Revise | Who Can Overwrite | Use Case |
|-------|---------------|-------------------|----------|
| `"owner_only"` (default) | `owner_id` (or `author_id`) only | Owner + `overwrite_allowed_ids` | Personal memories shared for reading |
| `"group_editors"` | Users with `can_revise` permission | Users with `can_overwrite` or in allowed list | Collaborative group documents |
| `"anyone"` | Any authenticated user | Any authenticated user | Wiki-style open editing |

### Null-Fallback Strategy

| Field | When Null | Behavior |
|-------|-----------|----------|
| `write_mode` | Pre-ACL memories | Treated as `"owner_only"` |
| `owner_id` | Original author owns it | Falls back to `author_id` |
| `last_revised_by` | No collaborative revision yet | No conflict detection (safe to revise) |
| `overwrite_allowed_ids` | No explicit grants | Treated as empty array |
| `moderation_status` | Pre-moderation memories | Treated as `"approved"` (backward compat) |

---

## Implementation

### Schema Changes (`v2-collections.ts`)

Add to `PUBLISHED_MEMORY_PROPERTIES`:

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

### Permission Resolution (3 Layers)

```
Layer 1: Memory-level (Weaviate)
  ├─ Read write_mode from published memory
  ├─ Read overwrite_allowed_ids from published memory
  └─ Resolve owner: owner_id ?? author_id

Layer 2: Group-level (agentbase.me credentials API)
  ├─ Only checked when write_mode === "group_editors"
  └─ Check group permissions: can_revise, can_overwrite

Layer 3: User-level (Firestore)
  ├─ Cross-user private access grants
  └─ Not involved in published memory ACLs
```

### Permission Utilities

```typescript
async function canRevise(
  userId: string,
  memory: PublishedMemory,
  credentialsFetcher?: () => Promise<UserCredentials>
): Promise<boolean> {
  const owner = memory.owner_id ?? memory.author_id;
  if (userId === owner) return true;

  const writeMode = memory.write_mode ?? 'owner_only';
  switch (writeMode) {
    case 'owner_only': return false;
    case 'group_editors':
      if (!credentialsFetcher) return false;
      const credentials = await credentialsFetcher();
      return (memory.group_ids ?? []).some(gid => {
        const membership = credentials.group_memberships_v2?.find(
          m => m.group_id === gid
        );
        return membership?.permissions.can_revise === true;
      });
    case 'anyone': return true;
  }
}

async function canOverwrite(
  userId: string,
  memory: PublishedMemory,
  credentialsFetcher?: () => Promise<UserCredentials>
): Promise<boolean> {
  const owner = memory.owner_id ?? memory.author_id;
  if (userId === owner) return true;
  if ((memory.overwrite_allowed_ids ?? []).includes(userId)) return true;

  const writeMode = memory.write_mode ?? 'owner_only';
  switch (writeMode) {
    case 'owner_only': return false;
    case 'group_editors':
      if (!credentialsFetcher) return false;
      const credentials = await credentialsFetcher();
      return (memory.group_ids ?? []).some(gid => {
        const membership = credentials.group_memberships_v2?.find(
          m => m.group_id === gid
        );
        return membership?.permissions.can_overwrite === true;
      });
    case 'anyone': return true;
  }
}
```

### Revision History Format

Updated to include `revised_by`:

```typescript
interface RevisionHistoryEntry {
  content: string;
  revised_at: string;
  revised_by?: string;   // NEW — null for pre-ACL revisions
}
```

### Moderation Status Lifecycle

```
pending → approved → removed
pending → rejected
```

- `pending`: Published, awaiting moderator review (when `require_moderation: true`)
- `approved`: Visible in default searches
- `rejected`: Moderator declined — invisible in default searches
- `removed`: Was approved, then removed post-publication

### Moderation Search Visibility

| Status | Default Search | Moderator Search |
|--------|---------------|-----------------|
| `approved` (or null) | visible | visible |
| `pending` | hidden | visible |
| `rejected` | hidden | visible |
| `removed` | hidden | visible |

### Per-Space Configuration (Firestore)

```typescript
interface SpaceConfig {
  require_moderation: boolean;    // false = auto-approve on publish
  default_write_mode: WriteMode;  // 'owner_only' | 'group_editors' | 'anyone'
}

const DEFAULT_SPACE_CONFIG: SpaceConfig = {
  require_moderation: false,
  default_write_mode: 'owner_only',
};
```

---

## Benefits

- **Granular control**: Per-memory write mode enables diverse collaboration patterns
- **Backward compatible**: Null fallbacks ensure existing memories work unchanged
- **Ownership transfer**: Separate `owner_id` from `author_id` for future flexibility
- **Conflict detection**: `last_revised_by` enables sync conflict resolution
- **Moderation workflow**: Full lifecycle with status tracking and moderator attribution

---

## Trade-offs

- **7 new schema fields**: Increases Weaviate property count on published memories (all nullable, no backfill needed)
- **Permission resolution complexity**: 3-layer resolution with external credentials API dependency
- **Moderation UX**: Users must understand pending/approved/rejected/removed states

---

## Dependencies

- `src/database/weaviate/v2-collections.ts` — Schema property definitions
- `src/types/auth.types.ts` — `GroupPermissions` (add `can_moderate`), `WriteMode`
- `src/services/space-config.service.ts` — Already exists with `getSpaceConfig()`, `setSpaceConfig()`
- agentbase.me credentials API — Group membership and permission data

---

## Testing Strategy

- Unit tests for `canRevise()`: owner access, group editor access, anyone mode, denied cases
- Unit tests for `canOverwrite()`: explicit ID grants, group permissions, fallback behavior
- Unit tests for null-fallback behavior on all 7 fields
- Unit tests for moderation search filter construction (approved, pending, moderator override)
- Integration tests for publish flow with `require_moderation: true/false`

---

## Migration Path

1. Task 19: Add 7 new properties to `PUBLISHED_MEMORY_PROPERTIES` in `v2-collections.ts`
2. Task 19: Add `can_moderate` to `GroupPermissions`, add `'ghost'`/`'comment'` to `ContentType`
3. Task 18: Create permission resolution utilities (`canRevise()`, `canOverwrite()`)
4. Task 20: Unit tests for ACL resolution and moderation filters
5. No backfill needed — null defaults handle all existing memories

---

## Future Considerations

- Ownership transfer tool: `remember_transfer_ownership` to change `owner_id`
- Per-field permissions: Grant access to modify specific fields only
- Moderation queue UI in agentbase.me
- Audit log for all permission checks and write operations
- Group-level `write_mode` defaults

---

**Status**: Design Specification
**Recommendation**: Implement in Tasks 18–20
**Related Documents**: [group-acl-integration.md](group-acl-integration.md), [trust-enforcement.md](trust-enforcement.md), [milestone-5](../milestones/milestone-5-trust-and-ghost-system.md)
