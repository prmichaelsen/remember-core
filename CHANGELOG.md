# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.16.0] - 2026-02-28

### Added
- **Client SDKs** — M9 complete (10 tasks), two new typed REST client SDKs:
  - **Svc Client** (`@prmichaelsen/remember-core/clients/svc/v1`) — 1:1 mirror of `/api/svc/v1/` routes:
    - `createSvcClient(config)` factory with 7 resource groups, 29 methods total
    - `memories` (6): create, update, delete, search, similar, query
    - `relationships` (4): create, update, delete, search
    - `spaces` (6): publish, retract, revise, moderate, search, query
    - `confirmations` (2): confirm, deny
    - `preferences` (2): get, update
    - `trust` (7): getGhostConfig, updateGhostConfig, setUserTrust, removeUserTrust, blockUser, unblockUser, checkAccess
    - `health` (2): check, version
  - **App Client** (`@prmichaelsen/remember-core/app`) — use-case compound operations:
    - `createAppClient(config)` factory with 2 resource groups, 5 methods total
    - `profiles` (4): createAndPublish, search, retract, updateAndRepublish
    - `ghost` (1): searchAsGhost
  - **Shared Infrastructure** (`src/clients/`):
    - `HttpClient` — fetch-based transport with auth (either/or: serviceToken JWT or getAuthToken callback)
    - `SdkResponse<T>` — Supabase-style `{ data, error }` with `.throwOnError()` chainable method
    - `RememberError` — typed error with code, message, status, context
    - `assertServerSide()` browser guard (prevents accidental secret bundling)
  - **Type Generation** — `openapi-typescript` generates types from OpenAPI specs:
    - `src/clients/svc/v1/types.generated.ts` from `docs/openapi.yaml`
    - `src/app/types.generated.ts` from `docs/openapi-web.yaml`
    - npm scripts: `generate:types:svc`, `generate:types:app`, `generate:types`
  - `jsonwebtoken` as optional peer dependency (required only for `auth.serviceToken` pattern)
  - 71 new tests across 8 suites (http, response, memories, spaces, trust, svc/index, app/profiles, app/index)

### Changed
- **BREAKING**: `./web` export removed — replaced by `./app` (REST wrapper, not direct service calls)
- `docs/openapi-web.yaml` renamed from web tier to app tier (`/api/web/v1/` → `/api/app/v1/`)
- Removed "confirmation-free" and "auto-confirm" language from app tier OpenAPI spec
- 13 subpath exports (was 12): removed `./web`, added `./app` and `./clients/svc/v1`
- 394 total tests across 26 suites (was 323 across 18 [v0.15.0 web tests still present])

## [0.15.0] - 2026-02-28

### Added
- **Web Client SDK** — M7 complete (10 tasks), `@prmichaelsen/remember-core/web` subpath export:
  - `src/web/result.ts` — `Result<T, E>` discriminated union (`{ ok, data/error }`), `ok()`, `err()`, `isOk()`, `mapOk()`, `tryCatch()`
  - `src/web/errors.ts` — `WebSDKError` interface (8 error kinds matching OpenAPI), `createError()`, 6 convenience factories
  - `src/web/guard.ts` — `assertServerSide()` browser guard (runs at import time)
  - `src/web/context.ts` — `WebSDKContext` interface, `createWebSDKContext()` factory
  - `src/web/memories.ts` — 6 functions: `createMemory`, `searchMemories`, `findSimilarMemories`, `queryMemories`, `updateMemory`, `deleteMemory`
  - `src/web/relationships.ts` — 4 functions: `createRelationship`, `searchRelationships`, `updateRelationship`, `deleteRelationship`
  - `src/web/spaces.ts` — 7 functions: `publishToSpace`, `retractFromSpace`, `reviseInSpace` (auto-confirmed), `moderateSpace`, `searchSpace`, `querySpace`
  - `src/web/ghost.ts` — 8 functions: `getGhostConfig`, `updateGhostConfig`, `setUserTrust`, `removeUserTrust`, `blockUser`, `unblockUser`, `checkAccess`, `searchAsGhost` (compound)
  - `src/web/profiles.ts` — 4 compound functions: `createAndPublishProfile`, `searchProfiles`, `retractProfile`, `updateAndRepublishProfile`
  - `src/web/preferences.ts` — 2 functions: `getPreferences`, `updatePreferences`
  - `src/web/types.ts` — `PaginatedResult<T>` (with `hasMore`), `MemorySearchResult`, `SimilarMemory`, `RelevantMemory`, `RelationshipSearchResult`, `SpaceSearchResult`, `ProfileSearchResult`, `RedactedMemory`
  - `src/web/index.ts` — barrel export (31 functions, all types, factories)
  - `package.json` — `exports["./web"]` and `typesVersions` for subpath resolution
  - 42 new tests across 6 suites (result, guard, memories, spaces, ghost, profiles)
  - Updated migration guide with web SDK section (before/after examples, WebSDKContext init, Result pattern matching)

### Changed
- 12 subpath exports (was 11)
- 323 total tests across 18 suites (was 281 across 12)

## [0.14.0] - 2026-02-28

### Added
- **Ghost-integrated MemoryService** — M6 complete (4 tasks):
  - `GhostSearchContext` type for passing trust/ghost context to memory operations
  - `ghost_context` parameter on `SearchMemoryInput`, `QueryMemoryInput`, `FindSimilarInput`
  - `MemoryService.search()` applies `buildTrustFilter()` and ghost content exclusion when `ghost_context` provided
  - `MemoryService.query()` applies trust filtering and ghost exclusion when `ghost_context` provided
  - `MemoryService.findSimilar()` applies trust filtering and ghost exclusion when `ghost_context` provided
  - Default behavior unchanged when `ghost_context` is absent (backwards compatible)
  - 13 new unit tests for ghost-integrated search/query/findSimilar paths
  - Updated migration guide with ghost search before/after examples

### Fixed
- Added `lessThanOrEqual` alias to mock collection filter (matches Weaviate v3 API)

## [0.13.0] - 2026-02-28

### Added
- **Trust & Ghost System** — M5 complete (6 tasks, 8 new source files, 150 new tests):
  - `src/types/ghost-config.types.ts` — GhostConfig, TrustEnforcementMode, DEFAULT_GHOST_CONFIG
  - `src/types/access-result.types.ts` — 6-variant AccessResult discriminated union
  - `src/services/trust-enforcement.service.ts` — 5-tier trust redaction, buildTrustFilter, formatMemoryForPrompt
  - `src/services/trust-validator.service.ts` — validateTrustAssignment, suggestTrustLevel
  - `src/services/access-control.service.ts` — checkMemoryAccess (6-step flow), canRevise, canOverwrite, PublishedMemoryACL
  - `src/services/ghost-config.service.ts` — Firestore CRUD for GhostConfig, FirestoreGhostConfigProvider
  - `src/services/escalation.service.ts` — FirestoreEscalationStore (block/attempt tracking)
  - `src/services/ghost-config-handler.service.ts` — orchestration layer for ghost config operations
  - GhostModeContext on AuthContext for server-resolved ghost mode
- **Schema updates** — 7 new nullable ACL/moderation fields on Memory type and PUBLISHED_MEMORY_PROPERTIES
  - write_mode, overwrite_allowed_ids, last_revised_by, owner_id (ACL)
  - moderation_status, moderated_by, moderated_at (moderation)
- `buildModerationStatusFilter()` utility for published memory queries
- 2 new content types: `ghost` (cross-user), `comment` (threaded)
- 150 new unit tests across 6 suites (270 total, 12 suites)
- Design documents: trust-enforcement, access-control-result, ghost-persona-system, memory-acl-schema
- Updated migration guide with trust & ghost system section

### Changed
- `src/types/auth.types.ts` — added GhostModeContext, ghostMode on AuthContext
- `src/types/memory.types.ts` — added 7 optional ACL/moderation fields
- `src/types/index.ts` — barrel exports for ghost config and access result types
- `src/services/index.ts` — 28 new exports for trust & ghost system services
- `src/utils/index.ts` — added buildModerationStatusFilter, ModerationStatus exports

## [0.12.0] - 2026-02-28

### Fixed
- ESM import resolution — added `.js` extensions to 11 scaffolded source files
- Removed 7 unused core-sdk scaffold files that blocked TypeScript build

### Added
- `.npmignore` for clean package publishing
- `tsconfig.json` at project root for `npm run build`
- `@prmichaelsen/remember-core@0.1.0` package.json with 11 subpath exports

### Changed
- `src/testing/index.ts` — barrel now exports weaviate-mock and test-data-generator

## [0.11.0] - 2026-02-27

### Added
- Service Tests and Validation (Task 11) — completes M3:
  - `src/testing/weaviate-mock.ts` — in-memory Weaviate collection mock with filter support
  - `src/collections/__tests__/composite-ids.spec.ts` — 15 tests for composite ID operations
  - `src/collections/__tests__/tracking-arrays.spec.ts` — 15 tests for tracking array operations
  - `src/collections/__tests__/dot-notation.spec.ts` — 15 tests for collection naming
  - `src/services/__tests__/memory.service.spec.ts` — 22 tests for MemoryService CRUD+search
  - `src/services/__tests__/relationship.service.spec.ts` — 22 tests for RelationshipService
  - `src/services/__tests__/space.service.spec.ts` — 31 tests for SpaceService operations
  - Jest config: rootDir, CJS transform, test scripts
  - 120 tests pass, 6 suites, 0 failures

### Changed
- M3 (Core Services) complete — 100% (4/4 tasks)

## [0.10.0] - 2026-02-27

### Added
- Create RelationshipService and SpaceService (Task 10):
  - `src/services/relationship.service.ts` — RelationshipService with 4 CRUD+search operations
    - `create()` — validate memory IDs, insert with doc_type='relationship', bidirectional references
    - `update()` — partial updates (relationship_type, observation, strength, confidence, tags)
    - `search()` — hybrid search filtered to relationships with type/strength/confidence filters
    - `delete()` — hard delete with memory reference cleanup
  - `src/services/space.service.ts` — SpaceService with 8 operations
    - `publish()` — phase 1: validate memory + generate confirmation token
    - `retract()` — phase 1: validate publication status + generate confirmation token
    - `revise()` — phase 1: validate published copies exist + generate confirmation token
    - `confirm()` — phase 2: execute pending publish/retract/revise with composite IDs
    - `deny()` — cancel pending action via ConfirmationTokenService
    - `moderate()` — approve/reject/remove published memories (requires moderator permissions)
    - `search()` — multi-source hybrid/bm25/semantic search across spaces+groups with deduplication
    - `query()` — semantic nearText query on public spaces collection
  - Exported helpers: buildModerationFilter, parseRevisionHistory, buildRevisionHistory
  - Updated `src/services/index.ts` barrel exports

### Changed
- M3 (Core Services) progress: 50% → 75% (3/4 tasks)

## [0.9.0] - 2026-02-27

### Added
- Create unified MemoryService (Task 9):
  - `src/services/memory.service.ts` — 6 CRUD+search operations extracted from MCP tool handlers
  - `create()` — insert memory with content type validation, scoring, tracking arrays
  - `search()` — hybrid semantic+keyword search with alpha, filters, pagination
  - `findSimilar()` — vector similarity via nearObject/nearText
  - `query()` — semantic nearText for RAG retrieval
  - `update()` — partial updates via replace(), version increment, ownership checks
  - `delete()` — soft delete with orphaned relationship detection
  - Typed input/output interfaces for all operations

### Changed
- M3 (Core Services) progress: 25% → 50% (2/4 tasks)

## [0.8.0] - 2026-02-27

### Added
- Port collection utilities and existing services (Task 8) — begins M3:
  - `src/collections/composite-ids.ts` — generateCompositeId, parseCompositeId, isCompositeId, belongsToUser
  - `src/collections/tracking-arrays.ts` — immutable space_ids/group_ids operations
  - `src/collections/dot-notation.ts` — CollectionType enum, getCollectionName, parseCollectionName
  - `src/collections/index.ts` — barrel exports
  - `src/services/preferences.service.ts` — PreferencesDatabaseService (Firestore-backed, DI)
  - `src/services/confirmation-token.service.ts` — ConfirmationTokenService (5-min expiry)
  - `src/services/credentials-provider.ts` — StubCredentialsProvider, factory, singleton
  - `src/services/space-config.service.ts` — getSpaceConfig, setSpaceConfig, DEFAULT_SPACE_CONFIG

### Changed
- M2 (Database & Configuration) marked complete
- M3 (Core Services) started — 25% (1/4 tasks)

## [0.7.0] - 2026-02-27

### Added
- Port utility modules (Task 7) — completes M2 milestone:
  - `src/utils/logger.ts` — createLogger() factory with structured JSON output
  - `src/utils/error-handler.ts` — formatDetailedError, handleToolError, withErrorHandling
  - `src/utils/filters.ts` — Weaviate v3 filter builders (combined, memory-only, relationship-only, deleted)
  - `src/utils/auth-helpers.ts` — canModerate(), canModerateAny() permission checks
  - `src/utils/debug.ts` — DebugLogger class (trace/debug/info/warn/error/dump/time)
  - `src/utils/index.ts` — barrel exports
  - `src/testing/test-data-generator.ts` — synthetic memory generation, benchmarking utils

### Changed
- M2 (Database & Configuration) complete — 100% (4/4 tasks)

## [0.6.0] - 2026-02-27

### Added
- Port configuration management (Task 6):
  - `src/config/environment.ts` — loadRememberConfig(), validateRememberConfig(), typed interfaces (WeaviateEnvConfig, OpenAIEnvConfig, FirebaseEnvConfig, ServerEnvConfig)
  - `src/config/debug.ts` — DebugLevel enum (NONE→TRACE), parseDebugLevel(), createDebugConfig()
  - Updated `src/config/index.ts` barrel exports

### Changed
- M2 (Database & Configuration) progress: 50% → 75% (3/4 tasks complete)

## [0.5.0] - 2026-02-27

### Added
- Port Weaviate client and schema module (Task 4):
  - `src/database/weaviate/client.ts` — WeaviateConfig-based client init, ALL_MEMORY_PROPERTIES, fetchMemoryWithAllProperties
  - `src/database/weaviate/schema.ts` — user memory collection CRUD (create, ensure, get, delete)
  - `src/database/weaviate/space-schema.ts` — space collection management, sanitizeSpaceId, PUBLIC_COLLECTION_NAME
  - `src/database/weaviate/v2-collections.ts` — v2 schema definitions (user, space, group), ~50 common + ~18 published properties
  - `src/database/weaviate/index.ts` — barrel exports
- Port Firestore initialization and paths (Task 5):
  - `src/database/firestore/init.ts` — Firebase Admin SDK init with FirestoreConfig param, re-exports SDK helpers
  - `src/database/firestore/paths.ts` — environment-based collection path helpers (user-scoped, cross-user, global)
  - `src/database/firestore/index.ts` — barrel exports
- Add `weaviate-client` ^3.11.0 dependency
- Add `@prmichaelsen/firebase-admin-sdk-v8` dependency

### Changed
- M2 (Database & Configuration) progress: 0% → 50% (2/4 tasks complete)

## [0.4.0] - 2026-02-27

### Added
- Port preference types: 6 category interfaces, defaults, descriptions, schema generator
- Port space types: SpaceMemory, SpaceSearchOptions, SpaceSearchResult, SpaceId, constants
- Port 41 content type constants with full metadata registry and category groupings
- Content type helpers: isValidContentType, getContentTypeMetadata, getContentTypesByCategory
- LLM types placeholder file for future use
- Constants barrel exports (src/constants/index.ts)

### Changed
- Milestone 1 (Types & Models) complete — all 3 tasks done

## [0.3.0] - 2026-02-27

### Added
- Port core memory types from remember-mcp: Memory, Relationship, MemoryDocument, MemoryUpdate, RelationshipUpdate
- Port context/location types: GPSCoordinates, Address, Location, Participant, Source, Environment, MemoryContext
- Port search types: SearchFilters, DeletedFilter, SearchOptions, SearchResult
- Port auth types: GroupPermissions, GroupMembership, UserCredentials, AuthContext, WriteMode, CredentialsProvider
- ContentType union (41 content types across 10 categories)
- Barrel exports from src/types/index.ts

### Changed
- Fix tsconfig.json paths for config/ subdirectory location
- Install TypeScript as dev dependency

## [0.2.0] - 2026-02-27

### Added
- Install core-sdk package (v1.22.0) with 25 patterns, architecture design doc, and bootstrap script
- TypeScript source scaffolding: services, client, config, errors, testing, and types modules
- Example implementations for REST, MCP, and CLI adapters
- Project config files (tsconfig, jest, esbuild)

### Changed
- Update ACP from v4.2.1 to v4.3.0
- Update manifest to track core-sdk package installation

## [0.1.0] - 2026-02-27

### Added
- Initialize project with ACP
- Basic project structure and README
