# Migration Guide: remember-mcp → remember-core

This guide covers migrating remember-mcp tool handlers from inline business logic to remember-core service calls.

## Overview

**Before**: Each MCP tool handler (e.g., `create-memory.ts`) contains ~50-200 lines of inline Weaviate queries, validation, and business logic.

**After**: Each tool handler is a thin adapter (~10-20 lines) that validates MCP-specific input, calls a remember-core service method, and formats the MCP response.

## Step 1: Install remember-core

```bash
npm install @prmichaelsen/remember-core
```

## Step 2: Initialize Services at Startup

Create a service initialization module that sets up core services once:

```typescript
// src/service-init.ts
import { MemoryService, RelationshipService, SpaceService } from '@prmichaelsen/remember-core';
import { ConfirmationTokenService, createLogger } from '@prmichaelsen/remember-core';

const logger = createLogger({ level: 'info' });
const tokenService = new ConfirmationTokenService(logger);

export function createServices(collection: any, userId: string) {
  return {
    memory: new MemoryService(collection, userId, logger),
    relationship: new RelationshipService(collection, userId, logger),
    space: new SpaceService(weaviateClient, collection, userId, tokenService, logger),
  };
}
```

## Step 3: Migrate Tool Handlers

### Pattern: Before/After

**Before** (inline logic in create-memory.ts):
```typescript
server.tool('create_memory', schema, async (params) => {
  const now = new Date().toISOString();
  const contentType = isValidContentType(params.type) ? params.type : 'note';
  const properties = {
    user_id: userId,
    doc_type: 'memory',
    content: params.content,
    content_type: contentType,
    weight: params.weight ?? 0.5,
    trust_score: params.trust ?? 0.25,
    // ... 20 more lines of property setup
  };
  const memoryId = await collection.data.insert({ properties });
  return { content: [{ type: 'text', text: JSON.stringify({ memory_id: memoryId }) }] };
});
```

**After** (delegating to remember-core):
```typescript
import { MemoryService } from '@prmichaelsen/remember-core';

server.tool('create_memory', schema, async (params) => {
  const result = await memoryService.create({
    content: params.content,
    type: params.type,
    weight: params.weight,
    trust: params.trust,
    tags: params.tags,
  });
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
```

### Tool Handler → Service Method Mapping

| MCP Tool | Service | Method |
|---|---|---|
| `create_memory` | `MemoryService` | `create()` |
| `search_memory` | `MemoryService` | `search()` |
| `find_similar` | `MemoryService` | `findSimilar()` |
| `query_memory` | `MemoryService` | `query()` |
| `update_memory` | `MemoryService` | `update()` |
| `delete_memory` | `MemoryService` | `delete()` |
| `create_relationship` | `RelationshipService` | `create()` |
| `search_relationship` | `RelationshipService` | `search()` |
| `update_relationship` | `RelationshipService` | `update()` |
| `delete_relationship` | `RelationshipService` | `delete()` |
| `publish` | `SpaceService` | `publish()` |
| `retract` | `SpaceService` | `retract()` |
| `revise` | `SpaceService` | `revise()` |
| `confirm` | `SpaceService` | `confirm()` |
| `deny` | `SpaceService` | `deny()` |
| `moderate` | `SpaceService` | `moderate()` |
| `search_space` | `SpaceService` | `search()` |
| `query_space` | `SpaceService` | `query()` |
| `get_preferences` | `PreferencesDatabaseService` | `getPreferences()` |
| `set_preferences` | `PreferencesDatabaseService` | `setPreferences()` |

### Import Mapping

| Old (inline) | New (remember-core) |
|---|---|
| `import { isValidContentType } from '../constants'` | `import { isValidContentType } from '@prmichaelsen/remember-core/constants'` |
| `import { fetchMemoryWithAllProperties } from '../utils/weaviate-client'` | `import { fetchMemoryWithAllProperties } from '@prmichaelsen/remember-core/database/weaviate'` |
| `import { buildCombinedSearchFilters } from '../utils/weaviate-filters'` | `import { buildCombinedSearchFilters } from '@prmichaelsen/remember-core/utils'` |
| `import type { SearchFilters } from '../types'` | `import type { SearchFilters } from '@prmichaelsen/remember-core/types'` |
| `import { generateCompositeId } from '../utils/composite-ids'` | `import { generateCompositeId } from '@prmichaelsen/remember-core/collections'` |

## Step 4: Migrate Trust & Ghost System (v0.13.0+)

### New Type Imports

```typescript
import type {
  GhostConfig,
  TrustEnforcementMode,
  GhostModeContext,
  AccessResult,
  AccessGranted,
  AccessInsufficientTrust,
  AccessBlocked,
  AccessResultStatus,
  WriteMode,
} from '@prmichaelsen/remember-core/types';
```

### New Service Imports

```typescript
import {
  // Trust enforcement
  TRUST_THRESHOLDS,
  buildTrustFilter,
  formatMemoryForPrompt,
  isTrustSufficient,
  getTrustLevelLabel,
  resolveEnforcementMode,

  // Trust validation
  validateTrustAssignment,
  suggestTrustLevel,

  // Access control
  checkMemoryAccess,
  resolveAccessorTrustLevel,
  formatAccessResultMessage,
  canRevise,
  canOverwrite,
  TRUST_PENALTY,
  MAX_ATTEMPTS_BEFORE_BLOCK,

  // Ghost config
  getGhostConfig,
  setGhostConfigFields,
  setUserTrust,
  blockUser,
  unblockUser,
  validateGhostConfigUpdate,
  FirestoreGhostConfigProvider,

  // Ghost config handler (orchestration)
  handleGetConfig,
  handleUpdateConfig,
  handleSetTrust,
  handleBlockUser,

  // Escalation
  FirestoreEscalationStore,

  // In-memory implementations (for testing)
  StubGhostConfigProvider,
  InMemoryEscalationStore,
} from '@prmichaelsen/remember-core/services';
```

### Trust Enforcement Quick Start

```typescript
import { buildTrustFilter, formatMemoryForPrompt, TRUST_THRESHOLDS } from '@prmichaelsen/remember-core/services';

// Query-level enforcement: filter memories by accessor's trust level
const trustFilter = buildTrustFilter(collection, accessorTrustLevel);
const results = await collection.query.hybrid('search query', { filters: trustFilter });

// Prompt-level enforcement: format memory for LLM with trust-based redaction
const formatted = formatMemoryForPrompt(memory, accessorTrustLevel);
// formatted.trust_tier = 'Full Access' | 'Partial Access' | 'Summary Only' | 'Metadata Only' | 'Existence Only'
// formatted.content = redacted content appropriate for the tier
```

### Access Control Pattern

```typescript
import { checkMemoryAccess, formatAccessResultMessage } from '@prmichaelsen/remember-core/services';

const result = await checkMemoryAccess(accessorUserId, memory, ghostConfigProvider, escalationStore);

switch (result.status) {
  case 'granted':
    // result.memory available, result.access_level = 'owner' | 'trusted'
    break;
  case 'insufficient_trust':
    // result.required_trust, result.actual_trust, result.attempts_remaining
    break;
  case 'blocked':
    // result.reason, result.blocked_at
    break;
  case 'no_permission':
    // Ghost not enabled or user blocked
    break;
  case 'not_found':
  case 'deleted':
    // Memory doesn't exist
    break;
}

// Or use the formatter for user-facing messages:
const message = formatAccessResultMessage(result);
```

### Permission Resolution (Write ACL)

```typescript
import { canRevise, canOverwrite } from '@prmichaelsen/remember-core/services';

// Check if user can edit a published memory
const allowed = await canRevise(userId, publishedMemory, credentialsFetcher);

// Check if user can overwrite (destructive edit)
const canReplace = await canOverwrite(userId, publishedMemory, credentialsFetcher);

// Write modes: 'owner_only' (default), 'group_editors', 'anyone'
// overwrite_allowed_ids: per-memory explicit grants (independent of group permissions)
```

### Ghost Config Setup

```typescript
import { getGhostConfig, setGhostConfigFields, setUserTrust } from '@prmichaelsen/remember-core/services';

// Get config (returns DEFAULT_GHOST_CONFIG if not set)
const config = await getGhostConfig(userId);

// Enable ghost mode
await setGhostConfigFields(userId, { enabled: true, default_public_trust: 0.25 });

// Set per-user trust override
await setUserTrust(ownerId, accessorId, 0.75);
```

### Schema Migration

7 new nullable fields on published memories (no backfill needed):

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `write_mode` | text | null → `"owner_only"` | Controls who can revise |
| `overwrite_allowed_ids` | text[] | `[]` | Per-memory overwrite grants |
| `last_revised_by` | text | null | Conflict detection |
| `owner_id` | text | null → `author_id` | Ownership transfer |
| `moderation_status` | text | null → `"approved"` | Moderation lifecycle |
| `moderated_by` | text | null | Moderator attribution |
| `moderated_at` | date | null | Moderation timestamp |

### Tool Handler → Service Mapping (Trust & Ghost)

| MCP Tool | Service | Method |
|---|---|---|
| `ghost_get_config` | `GhostConfigHandler` | `handleGetConfig()` |
| `ghost_update_config` | `GhostConfigHandler` | `handleUpdateConfig()` |
| `ghost_set_trust` | `GhostConfigHandler` | `handleSetTrust()` |
| `ghost_block_user` | `GhostConfigHandler` | `handleBlockUser()` |
| `ghost_unblock_user` | `GhostConfigHandler` | `handleUnblockUser()` |

### Content Type Additions

Two new content types added in v0.13.0:
- `'ghost'` — Ghost conversation memory (category: `cross_user`)
- `'comment'` — Threaded comments on shared memories (category: `cross_user`)

## Step 5: Remove Duplicated Code

After migrating all tool handlers, remove the following from remember-mcp:

- `src/types/` → now in `@prmichaelsen/remember-core/types`
- `src/utils/weaviate-filters.ts` → now in `@prmichaelsen/remember-core/utils`
- `src/utils/composite-ids.ts` → now in `@prmichaelsen/remember-core/collections`
- `src/utils/error-handler.ts` → now in `@prmichaelsen/remember-core/utils`
- `src/constants/content-types.ts` → now in `@prmichaelsen/remember-core/constants`
- `src/services/confirmation-token.service.ts` → now in `@prmichaelsen/remember-core/services`
- `src/services/preferences.service.ts` → now in `@prmichaelsen/remember-core/services`
- `src/services/trust-enforcement.ts` → now in `@prmichaelsen/remember-core/services`
- `src/services/trust-validator.ts` → now in `@prmichaelsen/remember-core/services`
- `src/services/access-control.ts` → now in `@prmichaelsen/remember-core/services`
- `src/services/ghost-config.service.ts` → now in `@prmichaelsen/remember-core/services`
- `src/services/escalation.service.ts` → now in `@prmichaelsen/remember-core/services`
- `src/tools/ghost-config.ts` (business logic) → now in `@prmichaelsen/remember-core/services`

## Step 5: Validate

```bash
# Build to verify no broken imports
npm run build

# Run existing tests
npm test

# Manual smoke test of each tool
```

## Ghost-Integrated Memory Search (v0.14.0+)

`MemoryService.search()`, `.query()`, and `.findSimilar()` now accept an optional `ghost_context` parameter for trust-level filtering and ghost content exclusion.

### Before (inline ghost filtering in remember-mcp)

```typescript
// search-memory.ts handler — manual ghost filtering
const ghostMode = authContext?.ghostMode;
const trustFilter = ghostMode
  ? buildTrustFilter(collection, ghostMode.accessor_trust_level)
  : null;
const ghostExclusionFilter = collection.filter.byProperty('content_type').notEqual('ghost');
const combined = combineFiltersWithAnd([deletedFilter, trustFilter, ghostExclusionFilter, searchFilters]);
const results = await collection.query.hybrid(args.query, { filters: combined });
```

### After (delegated to remember-core)

```typescript
// search-memory.ts handler — thin adapter
const { memory } = createCoreServices(userId);
const result = await memory.search({
  query: args.query,
  ghost_context: authContext?.ghostMode ? {
    accessor_trust_level: authContext.ghostMode.accessor_trust_level,
    owner_user_id: authContext.ghostMode.owner_user_id,
  } : undefined,
});
```

### GhostSearchContext

```typescript
import type { GhostSearchContext } from '@prmichaelsen/remember-core';

interface GhostSearchContext {
  accessor_trust_level: number;   // 0-1, filters memories by trust_score
  owner_user_id: string;          // Owner of the ghost memories
  include_ghost_content?: boolean; // true = include ghost content_type (default: exclude)
}
```

### Deferred Tool Migration (now unblocked)

| Tool | Core Method | Notes |
|------|-------------|-------|
| `search_memory` | `MemoryService.search()` + `ghost_context` | Was deferred in remember-mcp M17 |
| `query_memory` | `MemoryService.query()` + `ghost_context` | Was deferred in remember-mcp M17 |
| `ghost_config` | Direct imports from core | No service changes needed — already migrable |

## Step 6: Migrate to Web SDK (v0.15.0+)

The `@prmichaelsen/remember-core/web` subpath export provides use-case-oriented functions that bundle multi-step business logic into single calls. Server-side only.

### Before (manual orchestration with services)

```typescript
// Create a profile: 3 calls + manual orchestration
import { MemoryService, SpaceService, ConfirmationTokenService } from '@prmichaelsen/remember-core';

const memory = await memoryService.create({
  content: `Name: ${displayName}\nBio: ${bio}`,
  type: 'profile',
  tags,
});
const { token } = await spaceService.publish({
  memory_id: memory.memory_id,
  spaces: ['profiles'],
});
const confirmed = await spaceService.confirm({ token });
// + manual error handling, composite ID parsing
```

### After (single web SDK call)

```typescript
import { createAndPublishProfile } from '@prmichaelsen/remember-core/web';

const result = await createAndPublishProfile(ctx, {
  display_name: 'Jane Doe',
  bio: 'Software engineer',
  tags: ['developer'],
});
if (result.ok) {
  console.log(result.data.memory_id, result.data.composite_id);
} else {
  console.error(result.error.kind, result.error.message);
}
```

### WebSDKContext Initialization

```typescript
import { createWebSDKContext } from '@prmichaelsen/remember-core/web';

const ctx = createWebSDKContext({
  userId: 'user-123',
  memoryService,
  spaceService,
  confirmationTokenService,
  ghostConfigProvider,
  escalationStore,
  relationshipService,   // optional
  preferencesService,    // optional
  logger,                // optional
});
```

### searchAsGhost — Ghost Context Resolved Internally

```typescript
// Before: manual trust resolution + ghost_context
const ghostConfig = await getGhostConfig(ownerUserId);
const trustLevel = resolveAccessorTrustLevel(ghostConfig, accessorUserId);
const results = await memoryService.search({
  query: 'topic',
  ghost_context: { accessor_trust_level: trustLevel, owner_user_id: ownerUserId },
});
// + manual content redaction

// After: single call
import { searchAsGhost } from '@prmichaelsen/remember-core/web';
const result = await searchAsGhost(ctx, {
  owner_user_id: ownerUserId,
  query: 'topic',
});
// result.data.items contains redacted memories with trust_tier
```

### Result Pattern Matching

All web SDK functions return `Result<T, WebSDKError>`:

```typescript
import { searchMemories } from '@prmichaelsen/remember-core/web';

const result = await searchMemories(ctx, { query: 'important' });
if (result.ok) {
  // result.data: PaginatedResult<MemorySearchResult>
  for (const memory of result.data.items) {
    console.log(memory.memory_id, memory.content);
  }
  console.log(`Page ${result.data.offset}/${result.data.total}, hasMore: ${result.data.hasMore}`);
} else {
  // result.error: WebSDKError { kind, message, context }
  switch (result.error.kind) {
    case 'validation': /* handle */ break;
    case 'not_found': /* handle */ break;
    case 'unauthorized': /* handle */ break;
    default: /* handle */ break;
  }
}
```

## Migration Checklist

- [ ] Install `@prmichaelsen/remember-core`
- [ ] Create service initialization module
- [ ] Migrate memory tools (create, search, findSimilar, query, update, delete)
- [ ] Migrate relationship tools (create, search, update, delete)
- [ ] Migrate space tools (publish, retract, revise, confirm, deny, moderate, search, query)
- [ ] Migrate preferences tools (get, set)
- [ ] Migrate ghost config tools (get, update, set_trust, block, unblock)
- [ ] Set up AccessControlService with GhostConfigProvider and EscalationStore
- [ ] Add trust enforcement to search queries (use `ghost_context` parameter)
- [ ] Remove duplicated source files
- [ ] Verify build succeeds
- [ ] Verify all tests pass
- [ ] Migrate to client SDKs (replace hand-written fetch with typed REST wrappers)
- [ ] Use `createSvcClient` for granular 1:1 REST route access
- [ ] Use `createAppClient` for compound use-case operations (profiles, ghost)
- [ ] Replace ProfileMemoryService with `client.profiles.createAndPublish`/`search`/`retract`
- [ ] Replace manual ghost resolution with `client.ghost.searchAsGhost`
- [ ] Update error handling to Supabase-style `{ data, error }` / `.throwOnError()`

## Step 7: Client SDK Usage (v0.16.0+)

**BREAKING**: The `./web` export has been replaced by `./app` and `./clients/svc/v1`. The old web SDK called database services directly — the new client SDKs are typed REST wrappers around remember-rest-service.

### Before (hand-written fetch):

```typescript
const response = await fetch(`${baseUrl}/api/svc/v1/memories/search`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({ query: 'meeting notes', limit: 10 }),
});
const data = await response.json();
```

### After (svc client):

```typescript
import { createSvcClient } from '@prmichaelsen/remember-core/clients/svc/v1';

const client = createSvcClient({
  baseUrl: 'https://remember-rest-server-e1.run.app',
  getAuthToken: async (userId) => generateJwt(userId),
});

const { data, error } = await client.memories.search('user1', {
  query: 'meeting notes',
  limit: 10,
});
```

### After (app client — compound operations):

```typescript
import { createAppClient } from '@prmichaelsen/remember-core/app';

const client = createAppClient({
  baseUrl: 'https://remember-rest-server-e1.run.app',
  auth: { serviceToken: process.env.PLATFORM_SERVICE_TOKEN },
});

// Create and publish profile in one call
const { data } = await client.profiles.createAndPublish('user1', {
  display_name: 'Jane',
  bio: 'Software engineer',
  tags: ['developer'],
});

// Search as ghost (trust-filtered)
const ghost = await client.ghost.searchAsGhost('user1', {
  owner_user_id: 'user2',
  query: 'meeting notes',
  limit: 10,
});
```

### Auth patterns:

```typescript
// Pattern A: Consumer provides token
const client = createSvcClient({
  baseUrl: 'https://api.example.com',
  getAuthToken: async (userId) => {
    return await myAuthService.generateToken(userId);
  },
});

// Pattern B: SDK generates JWT (requires jsonwebtoken peer dep)
const client = createSvcClient({
  baseUrl: 'https://api.example.com',
  auth: {
    serviceToken: process.env.PLATFORM_SERVICE_TOKEN,
    jwtOptions: { issuer: 'my-app', expiresIn: '1h' },
  },
});
```

### Error handling:

```typescript
// Default: { data, error }
const { data, error } = await client.memories.create('user1', { content: 'hello' });
if (error) {
  console.error(`${error.code}: ${error.message} (HTTP ${error.status})`);
  return;
}
console.log(data);

// Throw mode
try {
  const data = await client.memories.create('user1', { content: 'hello' }).throwOnError();
} catch (e) {
  // e is a RememberError with .code, .message, .status
}
```
