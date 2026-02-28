# Web Client SDK

**Concept**: Server-side, use-case-oriented SDK for web apps consuming Remember services — bundling multi-step business logic into single calls
**Created**: 2026-02-28
**Updated**: 2026-02-28
**Status**: Design Specification
**OpenAPI Source**: [docs/openapi.yaml](../../docs/openapi.yaml) (v0.1.0 — source of truth for REST API)

---

## Overview

The web client SDK is a new subpath export (`@prmichaelsen/remember-core/web`) that provides use-case-oriented server-side functions for web applications. Unlike the existing service layer (which mirrors individual database operations), the web SDK bundles multi-step business logic into single calls optimized for web app consumption.

The first customer is **agentbase.me**, which currently performs manual orchestration across multiple remember-core services (e.g., creating a memory, publishing it to a space, and confirming — three separate calls for one user action). The web SDK collapses these into single RPC-style operations.

### Relationship to REST API (OpenAPI Spec)

The remember-rest-service exposes a **service-tier** REST API at `/api/svc/v1/` that maps 1:1 to remember-core services. The web SDK sits **above** both layers:

```
┌─────────────────────────────────────────────────────┐
│  Web App (agentbase.me, etc.)                       │
├─────────────────────────────────────────────────────┤
│  @prmichaelsen/remember-core/web                    │  ← use-case functions (this design)
│  Collapses multi-step flows into single calls       │
├─────────────────────────────────────────────────────┤
│  @prmichaelsen/remember-core (services)             │  ← 1:1 service operations
│  MemoryService, SpaceService, TrustEnforcement...   │
├─────────────────────────────────────────────────────┤
│  remember-rest-service /api/svc/v1/*                │  ← HTTP transport (OpenAPI spec)
│  Thin REST adapter over services                    │
├─────────────────────────────────────────────────────┤
│  Weaviate + Firestore                               │  ← storage
└─────────────────────────────────────────────────────┘
```

The web SDK **composes services in-process** (not via HTTP). It shares types and error conventions with the REST API but does not call it — consumers that need HTTP access use the REST API directly.

### Conventions Adopted from OpenAPI Spec

| Convention | OpenAPI (svc tier) | Web SDK |
|---|---|---|
| **Error envelope** | `{ error: { kind, message, context } }` | Same — `WebSDKError.kind` uses same 8 error kinds |
| **Error kinds** | validation, not_found, unauthorized, forbidden, conflict, rate_limit, external, internal | Same enum |
| **Pagination** | `{ total, offset, limit }` (offset-based) | Same — adds `hasMore` boolean for convenience |
| **Auth** | JWT Bearer, `aud: svc\|web` | Resolved userId via context; `aud: web` for REST-backed mode |
| **Content types** | 43 types (ContentType enum) | Re-exports same enum |
| **Ghost context** | `ghost_context: { accessor_trust_level, owner_user_id }` on search inputs | Resolved internally from GhostConfigProvider |
| **Two-phase confirmation** | publish → token → confirm (3 calls) | Collapsed to 1 call |
| **Moderation filter** | `approved\|pending\|rejected\|removed\|all` | Same enum, defaults to `approved` |

---

## Problem Statement

- **Multi-step orchestration burden**: Web apps must manually chain 2-4 service calls for common operations (create → publish → confirm, search → enrich → format). This logic is duplicated across consumers.
- **Leaky abstractions**: Web apps must understand internal details (composite IDs, confirmation tokens, space collection naming) that should be hidden.
- **No response standardization**: Each service returns different shapes. Web apps must normalize responses for their UI layer.
- **Security risk**: If services are imported directly in browser-capable code, database credentials could be exposed. The web SDK should fail explicitly in browser contexts.

**Consequences of not solving**: Every web app that consumes Remember reinvents the same orchestration, error handling, and response shaping — exactly the "thin adapter with 50-200 lines of inline logic" problem that remember-core was created to solve at the MCP layer.

---

## Solution

A **use-case-oriented function library** exported from `@prmichaelsen/remember-core/web` that:

1. **Composes** existing remember-core services (MemoryService, SpaceService, etc.) into higher-level operations
2. **Returns** `Result<T, E>` discriminated unions (from agent/patterns) for all operations
3. **Organizes** by use case (profiles, discovery, memories, spaces, ghost) rather than by resource
4. **Runs** server-side only — includes a runtime guard that throws if `window` is defined
5. **Accepts** an initialized `WebSDKContext` (services + auth) via dependency injection

### Alternative Approaches Rejected

| Approach | Why Rejected |
|---|---|
| Extend existing services with web methods | Mixes concerns; services should stay transport-agnostic |
| Create a separate npm package | User wants it in the same project as a subpath export |
| Framework-specific SDK (Next.js only) | agentbase.me uses TanStack Start; must be framework-agnostic |
| REST client (browser fetch) | Exposes secrets; server-side only for now |

---

## Implementation

### Architecture

```
@prmichaelsen/remember-core/web
  ├── context.ts          WebSDKContext initialization + browser guard
  ├── result.ts           Result<T, E> type + helpers (ok, err, mapOk, tryCatch)
  ├── profiles.ts         Profile discovery use cases
  ├── memories.ts         Memory CRUD use cases
  ├── spaces.ts           Space publishing use cases
  ├── ghost.ts            Ghost persona use cases
  ├── types.ts            Web SDK specific types (WebUser, ProfileResult, etc.)
  └── index.ts            Barrel exports
```

### WebSDKContext

All operations receive an initialized context rather than managing connections:

```typescript
import type { Logger } from '../utils/logger.js';

export interface WebSDKContext {
  /** Authenticated user ID */
  userId: string;
  /** Initialized MemoryService for the user's collection */
  memoryService: MemoryService;
  /** Initialized SpaceService */
  spaceService: SpaceService;
  /** Ghost config provider (Firestore-backed) */
  ghostConfigProvider: GhostConfigProvider;
  /** Escalation store */
  escalationStore: EscalationStore;
  /** Optional logger */
  logger?: Logger;
}

export function createWebSDKContext(options: {
  userId: string;
  weaviateClient: WeaviateClient;
  collection: WeaviateCollection;
  firestoreDb?: FirebaseFirestore.Firestore;
  logger?: Logger;
}): WebSDKContext;
```

### Result Type

Following the `core-sdk.types-result` pattern:

```typescript
export type Result<T, E = WebSDKError> =
  | { ok: true; data: T }
  | { ok: false; error: E };

export interface WebSDKError {
  kind: ErrorKind;
  message: string;
  context: Record<string, unknown>;
}

// Matches OpenAPI ErrorResponse.error.kind exactly
export type ErrorKind =
  | 'validation'
  | 'not_found'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'rate_limit'
  | 'external'
  | 'internal';

export function ok<T>(data: T): Result<T, never>;
export function err<E>(error: E): Result<never, E>;
export function tryCatch<T>(fn: () => Promise<T>): Promise<Result<T, WebSDKError>>;
```

### Use Case: Profiles (based on agentbase.me ProfileMemoryService)

```typescript
// --- What agentbase.me does today (3 calls + manual orchestration) ---
// 1. memoryService.create({ content, type: 'profile', ... })
// 2. spaceService.publish({ memory_id, space_id: 'profiles' })
// 3. spaceService.confirm({ token })
// + manual composite ID parsing, error handling, retries

// --- What the web SDK provides (1 call) ---
export async function createAndPublishProfile(
  ctx: WebSDKContext,
  input: {
    displayName: string;
    bio?: string;
    tags?: string[];
  },
): Promise<Result<{ memoryId: string; spaceId: string; compositeId: string }>>;

export async function searchProfiles(
  ctx: WebSDKContext,
  input: {
    query: string;
    limit?: number;
    offset?: number;
  },
): Promise<Result<PaginatedResult<ProfileSearchResult>>>;

export async function retractProfile(
  ctx: WebSDKContext,
  input: { memoryId: string },
): Promise<Result<{ retracted: true }>>;

export async function updateAndRepublishProfile(
  ctx: WebSDKContext,
  input: {
    memoryId: string;
    displayName?: string;
    bio?: string;
    tags?: string[];
  },
): Promise<Result<{ memoryId: string; compositeId: string }>>;
```

### Use Case: Memories

Aligns with OpenAPI `CreateMemoryInput`, `SearchMemoryInput`, `UpdateMemoryInput`, `DeleteMemoryInput` schemas.

```typescript
// Maps to POST /api/svc/v1/memories — but with additional orchestration
export async function createMemory(
  ctx: WebSDKContext,
  input: {
    content: string;
    title?: string;
    type?: ContentType;
    tags?: string[];
    weight?: number;
    trust?: number;
    references?: string[];
    parent_id?: string | null;
    thread_root_id?: string | null;
    context_summary?: string;
    context_conversation_id?: string;
  },
): Promise<Result<{ memory_id: string; created_at: string }>>;

// Maps to POST /api/svc/v1/memories/search — adds ghost context resolution
export async function searchMemories(
  ctx: WebSDKContext,
  input: {
    query: string;
    alpha?: number;          // 0-1, default 0.7 (semantic vs keyword balance)
    filters?: SearchFilters; // reuses OpenAPI SearchFilters schema
    include_relationships?: boolean;
    deleted_filter?: DeletedFilter;
    limit?: number;          // default 10, max 100
    offset?: number;
  },
): Promise<Result<PaginatedResult<MemorySearchResult>>>;

// Maps to POST /api/svc/v1/memories/similar
export async function findSimilarMemories(
  ctx: WebSDKContext,
  input: {
    memory_id?: string;
    text?: string;
    limit?: number;
    min_similarity?: number;
    deleted_filter?: DeletedFilter;
  },
): Promise<Result<{ similar_memories: SimilarMemory[]; total: number }>>;

// Maps to POST /api/svc/v1/memories/query
export async function queryMemories(
  ctx: WebSDKContext,
  input: {
    query: string;
    limit?: number;
    min_relevance?: number;
    filters?: SearchFilters;
    deleted_filter?: DeletedFilter;
  },
): Promise<Result<{ memories: RelevantMemory[]; total: number }>>;

// Maps to PATCH /api/svc/v1/memories/{memoryId}
export async function updateMemory(
  ctx: WebSDKContext,
  input: {
    memory_id: string;
    content?: string;
    title?: string;
    type?: string;
    weight?: number;
    trust?: number;
    tags?: string[];
    references?: string[];
    parent_id?: string | null;
    thread_root_id?: string | null;
  },
): Promise<Result<{ memory_id: string; updated_at: string; version: number; updated_fields: string[] }>>;

// Maps to DELETE /api/svc/v1/memories/{memoryId}
export async function deleteMemory(
  ctx: WebSDKContext,
  input: { memory_id: string; reason?: string },
): Promise<Result<{ memory_id: string; deleted_at: string; orphaned_relationship_ids: string[] }>>;
```

### Use Case: Relationships

Maps to OpenAPI `/api/svc/v1/relationships/*` endpoints.

```typescript
// Maps to POST /api/svc/v1/relationships
export async function createRelationship(
  ctx: WebSDKContext,
  input: {
    memory_ids: [string, string, ...string[]];
    relationship_type: string;
    observation: string;
    strength?: number;
    confidence?: number;
    tags?: string[];
    context_summary?: string;
    context_conversation_id?: string;
  },
): Promise<Result<{ relationship_id: string; memory_ids: string[]; created_at: string }>>;

// Maps to POST /api/svc/v1/relationships/search
export async function searchRelationships(
  ctx: WebSDKContext,
  input: {
    query: string;
    relationship_types?: string[];
    strength_min?: number;
    confidence_min?: number;
    tags?: string[];
    limit?: number;
    offset?: number;
    deleted_filter?: DeletedFilter;
  },
): Promise<Result<PaginatedResult<RelationshipSearchResult>>>;

// Maps to PATCH /api/svc/v1/relationships/{relationshipId}
export async function updateRelationship(
  ctx: WebSDKContext,
  input: {
    relationship_id: string;
    relationship_type?: string;
    observation?: string;
    strength?: number;
    confidence?: number;
    tags?: string[];
  },
): Promise<Result<{ relationship_id: string; updated_at: string; version: number; updated_fields: string[] }>>;

// Maps to DELETE /api/svc/v1/relationships/{relationshipId}
export async function deleteRelationship(
  ctx: WebSDKContext,
  input: { relationship_id: string },
): Promise<Result<{ relationship_id: string; memories_updated: number }>>;
```

### Use Case: Spaces

The key value-add: the OpenAPI spec requires 3 calls for publish (POST /spaces/publish → POST /confirmations/{token}/confirm). The web SDK collapses this to 1 call by auto-confirming internally.

```typescript
// Collapses: POST /spaces/publish → POST /confirmations/{token}/confirm
export async function publishToSpace(
  ctx: WebSDKContext,
  input: {
    memory_id: string;
    spaces?: string[];
    groups?: string[];
    additional_tags?: string[];
  },
): Promise<Result<{
  composite_id: string;
  published_to: string[];
  space_ids: string[];
  group_ids: string[];
  results: Array<{ location: string; status: 'success' | 'failed' | 'skipped'; error?: string }>;
}>>;

// Collapses: POST /spaces/retract → POST /confirmations/{token}/confirm
export async function retractFromSpace(
  ctx: WebSDKContext,
  input: {
    memory_id: string;
    spaces?: string[];
    groups?: string[];
  },
): Promise<Result<{
  retracted_from: string[];
  results: Array<{ location: string; status: 'success' | 'failed' | 'skipped'; error?: string }>;
}>>;

// Collapses: POST /spaces/revise → POST /confirmations/{token}/confirm
export async function reviseInSpace(
  ctx: WebSDKContext,
  input: { memory_id: string },
): Promise<Result<{ revised_at: string; memory_id: string }>>;

// Direct pass-through (no confirmation needed)
export async function moderateSpace(
  ctx: WebSDKContext,
  input: {
    memory_id: string;
    space_id?: string;
    group_id?: string;
    action: 'approve' | 'reject' | 'remove';
    reason?: string;
  },
): Promise<Result<{
  memory_id: string;
  action: string;
  moderation_status: string;
  moderated_by: string;
  moderated_at: string;
  location: string;
}>>;

// Maps to POST /api/svc/v1/spaces/search
export async function searchSpace(
  ctx: WebSDKContext,
  input: {
    query: string;
    spaces?: string[];
    groups?: string[];
    search_type?: 'hybrid' | 'bm25' | 'semantic';
    content_type?: string;
    tags?: string[];
    min_weight?: number;
    max_weight?: number;
    date_from?: string;
    date_to?: string;
    moderation_filter?: 'approved' | 'pending' | 'rejected' | 'removed' | 'all';
    include_comments?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<Result<{
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: SpaceSearchResult[];
  total: number;
  offset: number;
  limit: number;
}>>;

// Maps to POST /api/svc/v1/spaces/query
export async function querySpace(
  ctx: WebSDKContext,
  input: {
    question: string;
    spaces: string[];
    content_type?: string;
    tags?: string[];
    min_weight?: number;
    moderation_filter?: 'approved' | 'pending' | 'rejected' | 'removed' | 'all';
    include_comments?: boolean;
    limit?: number;
  },
): Promise<Result<{
  question: string;
  spaces_queried: string[];
  memories: SpaceSearchResult[];
  total: number;
}>>;
```

### Use Case: Ghost Personas

Maps to OpenAPI `/api/svc/v1/trust/*` endpoints. The web SDK resolves `ghost_context` automatically from GhostConfigProvider instead of requiring the caller to pass `accessor_trust_level`.

```typescript
// Maps to GET /api/svc/v1/trust/ghost-config
export async function getGhostConfig(
  ctx: WebSDKContext,
): Promise<Result<{ success: boolean; config: GhostConfig; message: string }>>;

// Maps to PATCH /api/svc/v1/trust/ghost-config
export async function updateGhostConfig(
  ctx: WebSDKContext,
  input: {
    enabled?: boolean;
    public_ghost_enabled?: boolean;
    default_friend_trust?: number;
    default_public_trust?: number;
    enforcement_mode?: 'query' | 'prompt' | 'hybrid';
  },
): Promise<Result<{ success: boolean; config: GhostConfig; message: string }>>;

// Maps to POST /api/svc/v1/trust/set-user-trust
export async function setUserTrust(
  ctx: WebSDKContext,
  input: { target_user_id: string; trust_level: number },
): Promise<Result<{ success: boolean; message: string }>>;

// Maps to POST /api/svc/v1/trust/remove-user-trust
export async function removeUserTrust(
  ctx: WebSDKContext,
  input: { target_user_id: string },
): Promise<Result<{ success: boolean; message: string }>>;

// Maps to POST /api/svc/v1/trust/block-user
export async function blockUser(
  ctx: WebSDKContext,
  input: { target_user_id: string },
): Promise<Result<{ success: boolean; message: string }>>;

// Maps to POST /api/svc/v1/trust/unblock-user
export async function unblockUser(
  ctx: WebSDKContext,
  input: { target_user_id: string },
): Promise<Result<{ success: boolean; message: string }>>;

// Maps to POST /api/svc/v1/trust/check-access
export async function checkAccess(
  ctx: WebSDKContext,
  input: { memory_id: string; accessor_user_id: string },
): Promise<Result<{ accessible: boolean; trust_tier: string; reason?: string }>>;

// Compound operation: search memories as ghost (resolves ghost_context internally)
// Combines: resolve trust level → build ghost_context → searchMemories with ghost_context
export async function searchAsGhost(
  ctx: WebSDKContext,
  input: {
    owner_user_id: string;
    query: string;
    limit?: number;
    offset?: number;
  },
): Promise<Result<PaginatedResult<RedactedMemory>>>;
```

### Use Case: Preferences

Maps to OpenAPI `/api/svc/v1/preferences` endpoints.

```typescript
// Maps to GET /api/svc/v1/preferences
export async function getPreferences(
  ctx: WebSDKContext,
): Promise<Result<UserPreferences>>;

// Maps to PATCH /api/svc/v1/preferences — partial update
export async function updatePreferences(
  ctx: WebSDKContext,
  input: {
    templates?: Partial<TemplatePreferences>;
    search?: Partial<SearchPreferences>;
    location?: Partial<LocationPreferences>;
    privacy?: Partial<PrivacyPreferences>;
    notifications?: Partial<NotificationPreferences>;
    display?: Partial<DisplayPreferences>;
  },
): Promise<Result<UserPreferences>>;
```

### Shared Types

Uses snake_case field names to match OpenAPI schemas (the REST API is the source of truth).

```typescript
// Pagination — matches OpenAPI SearchMemoryResult shape, adds hasMore convenience
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean; // computed: offset + limit < total
}

// Re-export OpenAPI types
export type { SearchFilters, DeletedFilter, ContentType, GhostConfig } from '../types/index.js';

// Profile use-case result
export interface ProfileSearchResult {
  user_id: string;
  display_name: string;
  bio?: string;
  tags: string[];
  similarity: number;
  memory_id: string;
  composite_id: string;
}

// Memory search result (matches OpenAPI SearchMemoryResult.memories items)
export interface MemorySearchResult {
  memory_id: string;
  content: string;
  content_type: ContentType;
  tags: string[];
  weight: number;
  trust_score: number;
  created_at: string;
  updated_at: string;
}

// Similar memory result (matches OpenAPI FindSimilarResult.similar_memories items)
export interface SimilarMemory extends MemorySearchResult {
  similarity: number;
}

// Relevant memory result (matches OpenAPI QueryMemoryResult.memories items)
export interface RelevantMemory extends MemorySearchResult {
  relevance: number;
}

// Space search result (matches OpenAPI SearchSpaceResult.memories items)
export interface SpaceSearchResult extends MemorySearchResult {
  space_id: string;
  composite_id: string;
  author_id: string;
  moderation_status: string;
}

// Ghost-redacted memory
export interface RedactedMemory {
  memory_id: string;
  trust_tier: 'full_access' | 'partial_access' | 'summary_only' | 'metadata_only' | 'existence_only';
  content: string; // redacted based on trust level
  tags: string[];
  access_level: string;
}
```

### Browser Guard

```typescript
// src/web/context.ts
function assertServerSide(): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      '@prmichaelsen/remember-core/web is server-side only. ' +
      'Do not import this module in browser code — it requires ' +
      'database credentials that must not be exposed to clients.'
    );
  }
}
```

---

## Benefits

- **Reduced boilerplate**: agentbase.me's `ProfileMemoryService` (~150 lines) collapses to ~5 import + call statements
- **Consistent responses**: All operations return `Result<T, WebSDKError>` — no more mixing thrown errors with return values
- **Hidden complexity**: Consumers never see confirmation tokens, composite ID parsing, or space collection naming
- **Safe by default**: Runtime browser guard prevents accidental credential exposure
- **Framework-agnostic**: Works with TanStack Start, Next.js, Express, Hono — any server-side JS runtime
- **Type-safe**: Full TypeScript coverage from input to output

---

## Trade-offs

- **Abstraction cost**: Multi-step operations are opaque — consumers can't customize intermediate steps without dropping to the service layer
  - Mitigation: Services remain available for advanced use cases; web SDK is additive, not a replacement
- **Context setup**: Consumers must initialize `WebSDKContext` before calling functions
  - Mitigation: Provide `createWebSDKContext()` factory with sensible defaults
- **Server-side only**: No browser client for now
  - Mitigation: Future enhancement — a fetch-based browser client that calls remember-rest-server

---

## Dependencies

- remember-core services: MemoryService, SpaceService, RelationshipService
- remember-core types: Memory, GhostConfig, AccessResult, ContentType, WriteMode
- remember-core collections: generateCompositeId, parseCompositeId
- remember-core trust: buildTrustFilter, formatMemoryForPrompt, checkMemoryAccess
- Weaviate client (injected via context)
- Firestore (injected via context, for ghost config and escalation)

---

## Testing Strategy

- **Unit tests**: Mock WebSDKContext with in-memory Weaviate mock + stub ghost config provider. Test each use-case function in isolation.
- **Integration tests**: End-to-end with real Weaviate + Firestore emulator. Test multi-step flows (create → publish → search → retract).
- **Browser guard test**: Verify runtime error when `window` is defined.
- **Target**: 80%+ coverage, 30-50 tests across 4-5 test suites.

---

## Migration Path

For agentbase.me (first consumer):

1. Install updated remember-core with `/web` subpath
2. Replace `ProfileMemoryService` with `createAndPublishProfile`, `searchProfiles`, `retractProfile`
3. Replace manual JWT + fetch calls with `WebSDKContext` initialization
4. Remove duplicated orchestration logic (~150 lines)
5. Update error handling from try/catch to Result pattern matching

---

## Future Considerations

- **Browser client SDK** (`@prmichaelsen/remember-core/client`): Fetch-based client for browser-side usage, calling remember-rest-server endpoints
- **React hooks** (`@prmichaelsen/remember-core/react`): `useMemory()`, `useSearch()`, `useProfile()` with SWR/TanStack Query integration
- **Real-time subscriptions**: WebSocket/SSE for memory update notifications
- **Batch operations**: `createMemories()`, `bulkPublish()` for import flows
- **Middleware helpers**: Auth middleware factories for Express/Hono/TanStack Start

---

**Status**: Design Specification
**Recommendation**: Create milestone (M6) and task breakdown for implementation
**Related Documents**:
- [clarification-1-client-sdk-web-first](../clarifications/clarification-1-client-sdk-web-first.md)
- [core-sdk.architecture](core-sdk.architecture.md)
- [core-sdk.adapter-client pattern](../patterns/core-sdk.adapter-client.md)
- [core-sdk.types-result pattern](../patterns/core-sdk.types-result.md)
- [OpenAPI Spec](../../docs/openapi.yaml) — REST API source of truth (v0.1.0)
