# Agent Memory Content Type Support

**Concept**: Add `content_type: 'agent'` for persistent agent working memory, with server-side default exclusion and `exclude_types` filter
**Created**: 2026-03-04
**Status**: Design Specification
**Source**: agentbase.me/agent/design/local.agent-memory-system.md

---

## Overview

The agentbase.me AI agent needs persistent working memory across conversations. The solution uses the existing `content_type` field — adding `'agent'` as a new content type. Agent memories must be invisible in default searches (safety net) and only returned when explicitly requested.

This design covers the remember-core changes needed. The agentbase.me side (prompt engineering, UI) is handled separately in that repo.

---

## Problem Statement

- No mechanism to distinguish agent-authored memories from user-authored memories
- Default searches would return agent memories alongside user content (data leakage)
- `SearchFilters.types` is include-only — no way to exclude specific content types
- No `follow_up_at` field for time-based memory retrieval (needed for follow-up reminders)

---

## Solution

Three changes to remember-core:

### 1. Add `'agent'` Content Type

Add to `src/constants/content-types.ts`:

```typescript
agent: {
  name: 'agent',
  category: 'system',
  description: 'Agent working memory — observations, preferences, session notes, project tracking',
  examples: [
    'User responds well to concise, bulleted answers',
    'User prefers seeing full code context rather than snippets',
    'When user says "fix it", they mean fix and commit without asking',
    'User is a senior engineer working primarily in TypeScript',
    'User timezone is US Central, typically active 9am-11pm',
    'User is building agentbase.me — an AI integration platform on Cloudflare Workers',
    'Auth system redesign planned for Q2 — user wants JWT replaced with session cookies',
    'User tracking 3 active projects: agentbase.me, remember-core, agentbase-mobile',
    'Milestone M36 (Notifications) nearly complete — 4 tasks remaining as of March 2026',
    'Follow up March 10: revisit subscription tier pricing discussion',
  ],
  common_fields: ['observations', 'preferences', 'summaries', 'follow_ups']
}
```

Also add `'agent'` to:
- `ContentType` union type in `src/types/memory.types.ts`
- `CONTENT_TYPES` array in `src/constants/content-types.ts`
- `system` category in `CONTENT_TYPE_CATEGORIES`

### 2. Server-Side Default Exclusion + `exclude_types` Filter

**Default exclusion** in `src/utils/filters.ts`:

```
When building search filters for memories:
  If no types filter specified (default search):
    Exclude content_type 'agent' automatically
  If types filter IS specified and includes 'agent':
    Do not exclude — caller explicitly opted in
```

Hard-coded for `'agent'` now. Will extend to `'scratch'`, `'ram'` as those content types are added later.

Apply to all search methods equally: hybrid search, BM25, vector search, list.

**`exclude_types` filter** in `src/types/search.types.ts`:

```typescript
interface SearchFilters {
  types?: ContentType[];
  exclude_types?: ContentType[];  // NEW
  // ... existing fields
}
```

In `src/utils/filters.ts`, when `exclude_types` is provided, add filters to exclude those content types from results. `exclude_types` takes precedence if a type appears in both `types` and `exclude_types`.

Wire `exclude_types` through to MCP tool input schemas where applicable (`remember_search_memory`, `remember_list_memories`, etc.).

### 3. Add `follow_up_at` Memory Property

New optional datetime field on memories for agent follow-up reminders.

**Weaviate schema** (`src/database/weaviate/v2-collections.ts`):
```typescript
// Add to COMMON_MEMORY_PROPERTIES
{ name: 'follow_up_at', dataType: ['date'] }
```

**Type definition** (`src/types/memory.types.ts`):
```typescript
// Add to Memory interface
follow_up_at?: string  // ISO 8601 datetime
```

**Service** (`src/services/memory.service.ts`):
```typescript
// Add to CreateMemoryInput
follow_up_at?: string
```

Pass through to Weaviate properties during creation. Update MCP tool schemas to accept `follow_up_at`.

REM processing of `follow_up_at` is future work — we are tracking the field now for forward compatibility.

---

## Benefits

- **Zero-friction agent memory** — reuses existing content_type infrastructure
- **Safe by default** — agent memories invisible unless explicitly requested
- **Future-proof** — `exclude_types` supports upcoming `scratch`, `ram` content types
- **Minimal changes** — constants + ~15 lines in filters + schema addition

---

## Trade-offs

- **Hard-coded exclusion** — only `'agent'` excluded for now (acceptable, will generalize later)
- **No separate collection** — agent memories share user's Weaviate collection (acceptable, content_type filtering is sufficient)
- **`follow_up_at` not processed** — field stored but REM doesn't act on it yet (forward-compatible)

---

## Dependencies

- None — all changes are internal to remember-core

---

## Testing Strategy

- **Unit**: `isValidContentType('agent')` returns true
- **Unit**: Default search filters exclude `content_type: 'agent'`
- **Unit**: Search with `types: ['agent']` includes agent memories
- **Unit**: `exclude_types: ['agent']` excludes agent memories
- **Unit**: `exclude_types` + `types` interaction (exclude takes precedence)
- **Unit**: `follow_up_at` field stored and retrievable
- **Integration**: Create memory with `type: 'agent'`, search without types filter, verify not returned
- **Regression**: All existing tests pass unchanged

---

## Implementation Tasks

From agentbase.me M47 (task specs in that repo):

| ID | Name | Est. Hours |
|----|------|-----------|
| 330 | Add 'agent' content type and metadata | 1-2 |
| 331 | Server-side default exclusion + exclude_types filter | 2-3 |
| 332 | Add follow_up_at memory property | 1-2 |

Tasks 330 and 332 are independent. Task 331 depends on 330.

---

**Status**: Design Specification
**Recommendation**: Implement tasks 330-332, release as new remember-core version. Agentbase.me will then consume for tasks 333-334 (prompt injector + UI).
**Related Documents**:
- agentbase.me: agent/design/local.agent-memory-system.md (full system design)
- agentbase.me: agent/clarifications/clarification-26, -27, -28
