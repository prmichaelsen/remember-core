# Client SDK Architecture — Svc Client + App Client

**Concept**: Typed REST client SDKs for remember-rest-service: a 1:1 svc client and a use-case-oriented app client
**Created**: 2026-02-28
**Status**: Design Specification

---

## Overview

Two client SDKs that wrap the remember-rest-service REST API with typed inputs/outputs, authentication, and error handling. Both are server-side only (browser guard) and use `fetch()` under the hood.

- **Svc client** (`remember-core/clients/svc/v1`) — 1:1 mirror of `/api/svc/v1/` REST routes
- **App client** (`remember-core/app`) — use-case-oriented compound operations for web apps (renamed from `/web` to avoid confusion since it doesn't run in browsers)

Types are generated from existing OpenAPI specs (`docs/openapi.yaml`, `docs/openapi-web.yaml`) using `openapi-typescript`.

---

## Problem Statement

- Web apps (agentbase.me) currently hand-write `fetch()` calls with manual JWT auth, URL construction, and response parsing
- No type safety on request/response shapes
- Compound operations (create+publish profile) require multiple coordinated fetch calls
- The current `remember-core/web` SDK (M7) calls database services directly, bypassing the REST server — wrong architecture

---

## Solution

### Architecture

```
                                     ┌─────────────────────────┐
                                     │  remember-rest-service   │
                                     │  (NestJS on Cloud Run)   │
                                     │                          │
                                     │  /api/svc/v1/*           │
                                     │  /api/app/v1/* (future)  │
                                     └──────────┬──────────────┘
                                                │
                              ┌─────────────────┼─────────────────┐
                              │                 │                 │
                    ┌─────────▼──────┐  ┌───────▼────────┐  ┌────▼─────┐
                    │ Svc Client SDK │  │ App Client SDK │  │ MCP SDK  │
                    │ clients/svc/v1 │  │ /app           │  │ (future) │
                    │ 1:1 REST mirror│  │ compound ops   │  │          │
                    └────────────────┘  └────────────────┘  └──────────┘
```

**Key principle**: Both client SDKs call REST endpoints via `fetch()`. Neither calls core services directly. The app client does NOT wrap the svc client — it calls the REST API independently, because:
- Multi-step app flows may not follow REST patterns
- Decoupled from svc API versioning (v1 → v2 migration)
- App-tier endpoints may exist on the server separately from svc-tier

### Subpath Exports

| Export | Purpose |
|--------|---------|
| `remember-core/clients/svc/v1` | 1:1 svc REST client |
| `remember-core/app` | Use-case-oriented app client (replaces current `/web`) |

The current `remember-core/web` (direct service calls) is **replaced** — no external consumers exist yet (v0.15.0 just published).

---

## Implementation

### Shared Infrastructure

#### HTTP Transport (`src/clients/http.ts`)

```typescript
interface HttpClientConfig {
  baseUrl: string;
  // Option A: SDK generates JWT per request
  auth?: {
    serviceToken: string;
    jwtOptions?: { issuer?: string; audience?: string; expiresIn?: string };
  };
  // Option B: Consumer provides token
  getAuthToken?: (userId: string) => string | Promise<string>;
  // Optional runtime validation
  validateResponses?: boolean;
}

interface HttpClient {
  request<T>(method: string, path: string, options?: {
    body?: unknown;
    params?: Record<string, string>;
    userId: string;
  }): Promise<SdkResponse<T>>;
}
```

`jsonwebtoken` is an **optional peer dependency** — required only if using `auth.serviceToken`. If `getAuthToken` is provided, no JWT dependency needed.

#### Error Handling — Supabase-style (`src/clients/response.ts`)

```typescript
interface SdkResponse<T> {
  data: T | null;
  error: RememberError | null;
}

interface RememberError {
  code: string;       // e.g. 'not_found', 'validation', 'unauthorized'
  message: string;
  status: number;     // HTTP status
  context?: Record<string, unknown>;
}

// Chainable throw option
interface ThrowableSdkResponse<T> extends SdkResponse<T> {
  throwOnError(): T;  // throws RememberError if error exists
}
```

Usage:
```typescript
// Default: { data, error }
const { data, error } = await client.memories.create(userId, { content: '...' });
if (error) { /* handle */ }

// Throw mode
const data = await client.memories.create(userId, { content: '...' }).throwOnError();
```

#### Browser Guard

Both clients call `assertServerSide()` on construction to prevent accidental browser bundling of service tokens.

### Type Generation

```bash
npx openapi-typescript docs/openapi.yaml -o src/clients/svc/v1/types.generated.ts
npx openapi-typescript docs/openapi-web.yaml -o src/clients/app/types.generated.ts
```

Generated types are committed to source control and regenerated when specs change. The hand-written client code references these types for request/response shapes.

### Svc Client (`src/clients/svc/v1/`)

1:1 mirror of `/api/svc/v1/` routes. Resource-grouped.

```typescript
import { createSvcClient } from '@prmichaelsen/remember-core/clients/svc/v1';

const client = createSvcClient({
  baseUrl: 'https://remember-rest-service-e1-dit6gawkbq-uc.a.run.app',
  auth: { serviceToken: process.env.PLATFORM_SERVICE_TOKEN },
});

// Memories
client.memories.create(userId, input)        // POST /api/svc/v1/memories
client.memories.update(userId, id, input)    // PATCH /api/svc/v1/memories/:id
client.memories.delete(userId, id, input?)   // DELETE /api/svc/v1/memories/:id
client.memories.search(userId, input)        // POST /api/svc/v1/memories/search
client.memories.similar(userId, input)       // POST /api/svc/v1/memories/similar
client.memories.query(userId, input)         // POST /api/svc/v1/memories/query

// Relationships
client.relationships.create(userId, input)   // POST /api/svc/v1/relationships
client.relationships.update(userId, id, input) // PATCH /api/svc/v1/relationships/:id
client.relationships.delete(userId, id)      // DELETE /api/svc/v1/relationships/:id
client.relationships.search(userId, input)   // POST /api/svc/v1/relationships/search

// Spaces
client.spaces.publish(userId, input)         // POST /api/svc/v1/spaces/publish
client.spaces.retract(userId, input)         // POST /api/svc/v1/spaces/retract
client.spaces.revise(userId, input)          // POST /api/svc/v1/spaces/revise
client.spaces.moderate(userId, input)        // POST /api/svc/v1/spaces/moderate
client.spaces.search(userId, input)          // POST /api/svc/v1/spaces/search
client.spaces.query(userId, input)           // POST /api/svc/v1/spaces/query

// Confirmations
client.confirmations.confirm(userId, token)  // POST /api/svc/v1/confirmations/:token/confirm
client.confirmations.deny(userId, token)     // POST /api/svc/v1/confirmations/:token/deny

// Preferences
client.preferences.get(userId)               // GET /api/svc/v1/preferences
client.preferences.update(userId, input)     // PATCH /api/svc/v1/preferences

// Trust
client.trust.getGhostConfig(userId)                   // GET /api/svc/v1/trust/ghost-config
client.trust.updateGhostConfig(userId, input)         // PATCH /api/svc/v1/trust/ghost-config
client.trust.setUserTrust(userId, input)              // POST /api/svc/v1/trust/set-user-trust
client.trust.removeUserTrust(userId, input)           // POST /api/svc/v1/trust/remove-user-trust
client.trust.blockUser(userId, input)                 // POST /api/svc/v1/trust/block-user
client.trust.unblockUser(userId, input)               // POST /api/svc/v1/trust/unblock-user
client.trust.checkAccess(userId, input)               // POST /api/svc/v1/trust/check-access

// Health (no userId needed)
client.health.check()                        // GET /health
client.health.version()                      // GET /version
```

All methods return `Promise<SdkResponse<T>>` with `.throwOnError()`.

**No auto-confirm.** Publish/retract/revise return `{ token }`. Consumer must call `client.confirmations.confirm(token)` explicitly.

### App Client (`src/app/`)

Use-case-oriented compound operations. Calls `/api/app/v1/` endpoints (or `/api/svc/v1/` until app-tier routes exist on the server).

```typescript
import { createAppClient } from '@prmichaelsen/remember-core/app';

const client = createAppClient({
  baseUrl: 'https://remember-rest-service-e1-dit6gawkbq-uc.a.run.app',
  auth: { serviceToken: process.env.PLATFORM_SERVICE_TOKEN },
});

// Profiles (compound)
client.createAndPublishProfile(userId, { display_name, bio, tags })
client.searchProfiles(userId, { query, limit, offset })
client.retractProfile(userId, { memory_id })
client.updateAndRepublishProfile(userId, { memory_id, display_name, bio, tags })

// Ghost (compound)
client.searchAsGhost(userId, { owner_user_id, query, limit, offset })
```

**No auto-confirm in app client either.** Compound operations that involve publish/retract return tokens. The consumer confirms.

Note: Initially, the app client calls `/api/svc/v1/` endpoints (composing multiple calls for compound operations). When `/api/app/v1/` endpoints are implemented on the REST server, the app client migrates to those single-endpoint calls transparently.

### File Structure

```
src/
├── clients/
│   ├── http.ts                    # Shared HTTP transport
│   ├── response.ts                # SdkResponse, RememberError, throwOnError
│   ├── guard.ts                   # assertServerSide (reuse existing)
│   └── svc/
│       └── v1/
│           ├── index.ts           # createSvcClient factory + barrel
│           ├── types.generated.ts # openapi-typescript output
│           ├── memories.ts        # MemoriesResource
│           ├── relationships.ts   # RelationshipsResource
│           ├── spaces.ts          # SpacesResource
│           ├── confirmations.ts   # ConfirmationsResource
│           ├── preferences.ts     # PreferencesResource
│           ├── trust.ts           # TrustResource
│           └── health.ts          # HealthResource
├── app/
│   ├── index.ts                   # createAppClient factory + barrel
│   ├── types.generated.ts         # openapi-typescript output (from web spec)
│   ├── profiles.ts                # Profile compound operations
│   └── ghost.ts                   # Ghost compound operations
```

---

## Benefits

- **Type safety**: Request/response types generated from OpenAPI specs
- **No REST knowledge needed**: Consumers call typed methods, not URLs
- **Supabase-style errors**: `{ data, error }` default with `.throwOnError()` escape hatch
- **Auth flexibility**: Built-in JWT or consumer-provided token
- **Server-side safe**: Browser guard prevents accidental secret exposure
- **Spec-driven**: Types always in sync with the REST server's OpenAPI spec

---

## Trade-offs

- **Extra network hop preserved**: Unlike the direct-service M7 approach, this goes through the REST server. Mitigated by the server being on Cloud Run (low latency within GCP).
- **Two specs to maintain**: `openapi.yaml` (svc) and `openapi-web.yaml` (app). Mitigated by specs being source of truth, types auto-generated.
- **jsonwebtoken as optional peer dep**: Consumers using `auth.serviceToken` must install it. Those using `getAuthToken` don't need it.
- **App client initially calls svc endpoints**: Until `/api/app/v1/` routes exist on the server, compound operations compose multiple svc calls. Extra round trips for now.

---

## Dependencies

- `openapi-typescript` (devDependency) — type generation from OpenAPI specs
- `jsonwebtoken` (optional peerDependency) — JWT generation for built-in auth
- Existing: `docs/openapi.yaml`, `docs/openapi-web.yaml` (already in project)

---

## Testing Strategy

- **Unit tests**: Mock `fetch()`, verify correct URL/method/body/headers for each client method
- **Response tests**: Verify `{ data, error }` shape, `.throwOnError()` behavior, error code mapping
- **Auth tests**: Verify JWT generation (when serviceToken provided) and custom token callback
- **Browser guard test**: Verify construction throws in browser-like environment
- **Type tests**: Verify generated types match expected shapes (compile-time)

---

## Migration Path

1. Generate types from OpenAPI specs
2. Build shared HTTP transport + response types
3. Build svc client (1:1 route mirror)
4. Build app client (compound operations)
5. Update `openapi-web.yaml`: remove "confirmation-free" language, rename `web` → `app` tier
6. Replace current `src/web/` with new `src/app/`
7. Update package.json exports: replace `./web` with `./app`, add `./clients/svc/v1`
8. Update agentbase.me migration plan to use app client

---

## Future Considerations

- **`@prmichaelsen/rest-auth`**: Separate auth package that consumers can depend on
- **Pluggable HTTP client**: Replace internal `fetch()` with configurable transport (Axios, undici)
- **Request/response interceptors**: Logging, metrics, retry logic
- **Full codegen**: Replace hand-written client with `orval` or `openapi-fetch` generated client
- **`/api/app/v1/` server routes**: Implement app-tier endpoints on remember-rest-service so compound ops are single round trips
- **Browser-safe client**: If needed, a separate export without browser guard (no auth bundled)

---

**Status**: Design Specification
**Recommendation**: Implement as M8 milestone in remember-core
**Related Documents**:
- `agent/clarifications/clarification-1-client-sdk-web-first.md`
- `agent/clarifications/clarification-2-web-sdk-rest-wrapper-architecture.md`
- `agent/clarifications/clarification-3-web-sdk-rewrite-open-decisions.md`
- `agent/clarifications/clarification-4-web-sdk-final-decisions.md`
- `docs/openapi.yaml` (svc tier spec)
- `docs/openapi-web.yaml` (app tier spec)
