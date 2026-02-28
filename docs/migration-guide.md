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

## Step 4: Remove Duplicated Code

After migrating all tool handlers, remove the following from remember-mcp:

- `src/types/` → now in `@prmichaelsen/remember-core/types`
- `src/utils/weaviate-filters.ts` → now in `@prmichaelsen/remember-core/utils`
- `src/utils/composite-ids.ts` → now in `@prmichaelsen/remember-core/collections`
- `src/utils/error-handler.ts` → now in `@prmichaelsen/remember-core/utils`
- `src/constants/content-types.ts` → now in `@prmichaelsen/remember-core/constants`
- `src/services/confirmation-token.service.ts` → now in `@prmichaelsen/remember-core/services`
- `src/services/preferences.service.ts` → now in `@prmichaelsen/remember-core/services`

## Step 5: Validate

```bash
# Build to verify no broken imports
npm run build

# Run existing tests
npm test

# Manual smoke test of each tool
```

## Migration Checklist

- [ ] Install `@prmichaelsen/remember-core`
- [ ] Create service initialization module
- [ ] Migrate memory tools (create, search, findSimilar, query, update, delete)
- [ ] Migrate relationship tools (create, search, update, delete)
- [ ] Migrate space tools (publish, retract, revise, confirm, deny, moderate, search, query)
- [ ] Migrate preferences tools (get, set)
- [ ] Remove duplicated source files
- [ ] Verify build succeeds
- [ ] Verify all tests pass
