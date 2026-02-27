# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

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
