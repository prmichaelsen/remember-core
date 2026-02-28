# @prmichaelsen/remember-core

Transport-agnostic core SDK for Remember. Extracts business logic from remember-mcp so both remember-mcp-server (MCP transport) and remember-rest-server (REST transport) can share the same services.

## Installation

```bash
npm install @prmichaelsen/remember-core
```

## Quick Start

```typescript
import { MemoryService, createLogger } from '@prmichaelsen/remember-core';
import { getWeaviateClient } from '@prmichaelsen/remember-core/database/weaviate';

const logger = createLogger({ level: 'info' });
const client = await getWeaviateClient({ host: 'localhost', port: 8080, scheme: 'http' });
const collection = client.collections.get(`Memory_users_${userId}`);
const memoryService = new MemoryService(collection, userId, logger);

// Create a memory
const { memory_id } = await memoryService.create({
  content: 'Remember this important fact',
  type: 'note',
  tags: ['important'],
});

// Search memories
const results = await memoryService.search({
  query: 'important fact',
  limit: 10,
});
```

## Subpath Imports

| Import Path | Contents |
|---|---|
| `@prmichaelsen/remember-core` | Common types, services, errors, utils |
| `@prmichaelsen/remember-core/types` | All type definitions and interfaces |
| `@prmichaelsen/remember-core/services` | Service classes and input/output types |
| `@prmichaelsen/remember-core/collections` | Composite IDs, tracking arrays, dot notation |
| `@prmichaelsen/remember-core/constants` | Content types (43 types across 11 categories) |
| `@prmichaelsen/remember-core/config` | Environment config, debug levels |
| `@prmichaelsen/remember-core/database/weaviate` | Weaviate client, schema, space collections |
| `@prmichaelsen/remember-core/database/firestore` | Firestore init, path helpers |
| `@prmichaelsen/remember-core/errors` | Typed errors (AppError, 8 subclasses) |
| `@prmichaelsen/remember-core/utils` | Logger, filters, auth helpers, debug |
| `@prmichaelsen/remember-core/testing` | Weaviate mock, test data generator |
| `@prmichaelsen/remember-core/app` | App client — use-case REST wrapper (profiles, ghost) |
| `@prmichaelsen/remember-core/clients/svc/v1` | Svc client — 1:1 REST route mirror (29 methods) |

## Core Services

**MemoryService** — 6 operations: create, search (hybrid), findSimilar (vector), query (semantic), update, delete (soft).

**RelationshipService** — 4 operations: create, search, update, delete relationships between memories.

**SpaceService** — 8 operations: publish, retract, revise, confirm, deny, moderate, search, query across shared spaces. Two-phase confirmation flow.

**PreferencesDatabaseService** — User preference CRUD via Firestore.

**ConfirmationTokenService** — Time-limited one-use tokens for sensitive operations (5-minute expiry).

### Trust & Ghost System

**TrustEnforcementService** — 5-tier content redaction (Full Access → Existence Only), query-level and prompt-level enforcement modes.

**AccessControlService** — Per-memory access checks with 6-step resolution (self → ghost → block → trust → grant), trust escalation prevention, `canRevise()`/`canOverwrite()` permission resolution.

**GhostConfigService** — Firestore-backed ghost persona configuration CRUD (trust levels, blocked users, enforcement mode).

**EscalationService** — Trust penalty tracking and automatic blocking after repeated unauthorized access attempts.

### Client SDKs

Two typed REST client SDKs wrapping the remember-rest-service API. Both are server-side only (browser guard). Supabase-style `{ data, error }` responses with `.throwOnError()`.

**Svc Client** (`@prmichaelsen/remember-core/clients/svc/v1`) — 1:1 mirror of `/api/svc/v1/` routes, 29 methods across 7 resource groups:

```typescript
import { createSvcClient } from '@prmichaelsen/remember-core/clients/svc/v1';

const client = createSvcClient({
  baseUrl: 'https://remember-rest-server-e1.run.app',
  getAuthToken: async (userId) => generateJwt(userId),
});

const { data, error } = await client.memories.search('user1', { query: 'meeting notes', limit: 10 });
if (error) console.error(error.code, error.message);

// Or throw on error
const results = await client.memories.search('user1', { query: 'meeting notes' }).throwOnError();
```

**App Client** (`@prmichaelsen/remember-core/app`) — compound use-case operations (profiles, ghost), 5 methods:

```typescript
import { createAppClient } from '@prmichaelsen/remember-core/app';

const client = createAppClient({
  baseUrl: 'https://remember-rest-server-e1.run.app',
  auth: { serviceToken: process.env.PLATFORM_SERVICE_TOKEN },
});

const { data } = await client.profiles.createAndPublish('user1', { display_name: 'Jane', bio: 'Engineer' });
const ghost = await client.ghost.searchAsGhost('user1', { owner_user_id: 'user2', query: 'notes' });
```

## Testing

```bash
npm test           # Unit tests (394 tests)
npm run test:e2e   # Integration tests (22 tests)
npm run typecheck  # Type checking
npm run build      # TypeScript compilation
```

## Migration from remember-mcp

See [docs/migration-guide.md](docs/migration-guide.md) for instructions on replacing inline tool handler logic with remember-core service calls.

## Architecture

```
remember-core (this package)
  ├── types/         Type definitions (Memory, Relationship, Preferences, etc.)
  ├── constants/     Content types, enums
  ├── config/        Environment loading, debug config
  ├── errors/        Typed error hierarchy (8 error kinds)
  ├── database/      Weaviate + Firestore initialization
  ├── collections/   Weaviate collection utilities
  ├── utils/         Logger, filters, auth helpers
  ├── services/      Business logic (5 core + 4 trust/ghost service modules)
  ├── clients/       Shared HTTP transport, SdkResponse, browser guard
  │   └── svc/v1/   Svc client (1:1 REST route mirror, 29 methods)
  ├── app/           App client (compound use-case operations, 5 methods)
  └── testing/       Mock infrastructure for consumers

remember-rest-service (server)
  └── REST routes wrapping remember-core services

remember-mcp-server (consumer)
  └── MCP tool handlers → thin adapters calling remember-core services
```

## License

MIT
