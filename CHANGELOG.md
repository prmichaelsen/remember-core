# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [0.27.3] - 2026-03-05

### Added
- **`includeSimilar` and `similarLimit` options** on `AppClient.memories.get()` (task-82)
  - `MemoryWithRelationships` response includes optional `similar_memories` field
  - SDK passes `includeSimilar` and `similarLimit` as query params
  - OpenAPI spec updated with new endpoint parameters and response schema
  - 4 new unit tests for includeSimilar/similarLimit behavior

Completed Task 82: Add includeSimilar Support to AppClient.memories.get()
Version: 0.27.2 → 0.27.3

## [0.27.2] - 2026-03-05

### Fixed
- **HttpClient query params bug** — `HttpClient.request()` now appends `options.params` as URL query string
  - Previously, params were silently dropped (URL constructed without query string)
  - Affected all App Client GET requests: `memories.get()`, `relationships.getMemories()`
  - Empty/undefined params do not add trailing `?`
  - 3 new unit tests for params serialization
  - 626 tests passing across 45 suites

Completed Task 83: Fix HttpClient Query Params Not Appended to URL
Version: 0.27.1 → 0.27.2

## [0.27.1] - 2026-03-04

### Added
- **M16: Job Tracking System** (tasks 79-80, completing milestone)
  - `RemJobWorker` — REM cycle execution as tracked job steps with 4-phase progress reporting
  - `scheduleRemJobs()` — daily cron utility to enumerate collections and create per-collection REM jobs
  - `RemCursorState` and `RemCollectionState` marked `@deprecated` in favor of job-based scheduling
  - Job barrel exports: all types, JobService, ImportJobWorker, RemJobWorker, scheduleRemJobs
  - Integration tests: full lifecycle, cancellation flow, partial failure with `completed_with_errors`
  - Fix: `updateProgress()` no longer overwrites cancelled status with 'running'

### Changed
- 623 tests passing across 45 suites (was 536)

Version: 0.27.0 → 0.27.1

## [0.27.0] - 2026-03-04

### Added
- **M15: Relationship GUI App Endpoints** (tasks 71-74)
  - `RelationshipService.getById()` — fetch single relationship by UUID with discriminated union result
  - `relationship_ids` filter on `SearchFilters` — scope memory searches to specific relationships
  - `MemoriesResource` (`src/app/memories.ts`) — compound `get()` returns memory + relationship previews with `MemoryPreview` titles
  - `RelationshipWithPreviews`, `MemoryPreview`, `MemoryWithRelationships` types
  - `RelationshipsResource` (`src/app/relationships.ts`) — `getMemories()` returns paginated relationship memories with `RelationshipMetadata`
  - Both resources wired into `createAppClient()` factory (7 total methods)
  - OpenAPI schemas for compound endpoint responses in `openapi-web.yaml`
- **M16: Job Tracking System** (tasks 75-78)
  - `JobService` — Firestore-backed async job CRUD with progress tracking, step management, TTL, cancellation
  - Job types: `import`, `rem_cycle` with statuses: pending → running → completed/failed/cancelled
  - `ImportJobWorker` — async import with step tracking, cancellation checks, chunking + summary generation
  - `JobsResource` in SVC client — `get()`, `cancel()`, `poll()` with configurable interval/timeout
  - OpenAPI job schemas and endpoints (`/api/svc/v1/jobs/{jobId}`, cancel)
  - Import endpoint updated to return 202 with `job_id`
- `GetRelationshipResult` type exported from services barrel

Version: 0.26.1 → 0.27.0

## [0.26.1] - 2026-03-04

### Added
- **MemoryResolutionService** — cross-collection memory lookup with fallback when context params (author/space/group) are invalid
  - `resolveCollectionName()` — collection resolution with priority: group > space > author > user's own
  - `resolve()` — fetch memory by ID, trying the requested collection first then falling back to user's own collection
  - Handles cases where agents construct memory links with incorrect context params
  - Exported types: `MemorySource`, `ResolvedMemory`

Version: 0.26.0 → 0.26.1

## [0.26.0] - 2026-03-04

### Added
- **Agent content type** (`content_type: 'agent'`) — persistent agent working memory for observations, preferences, session notes, project tracking
  - Added to `ContentType` union, `CONTENT_TYPES` array, `CONTENT_TYPE_METADATA` (category: system, 10 examples), `CONTENT_TYPE_CATEGORIES`
  - Added to OpenAPI `ContentType` enum (also added missing `profile`)
- **`exclude_types` filter** on `SearchFilters` — exclude specific content types from search results without listing all others
  - Takes precedence if a type appears in both `types` and `exclude_types`
  - Added to OpenAPI `SearchFilters` schema
- **Server-side default exclusion** — `content_type: 'agent'` automatically excluded from unfiltered searches (no `types` specified). Explicitly including `'agent'` in `types` opts in.
- **`follow_up_at` memory property** — ISO 8601 datetime field for agent follow-up reminders
  - Added to Weaviate schema (`COMMON_MEMORY_PROPERTIES`), `Memory` interface, `CreateMemoryInput`, and OpenAPI `CreateMemoryInput` schema
  - REM processing of follow_up_at is future work — field tracked now for forward compatibility

Version: 0.25.0 → 0.26.0

## [0.25.0] - 2026-03-04

### Added
- **ImportService** — bulk memory import with token-count chunking, HaikuClient summary generation, and relationship linking
  - `chunkByTokens()` — splits text on paragraph boundaries within configurable token budget (~4 chars/token estimation)
  - `estimateTokens()` — rough token count from text length
  - `ImportService.import()` — accepts multiple items, chunks each, creates chunk memories with `[CHUNK NNNNN]` markers, generates parent summary via HaikuClient, links chunks to parent via `part_of` relationships
  - Types: `ImportItem`, `ImportInput`, `ImportItemResult`, `ImportResult`
- 19 unit tests for ImportService, chunkByTokens, and estimateTokens
- **OpenAPI spec**: `POST /api/svc/v1/memories/import` endpoint with `ImportInput`, `ImportResult`, `ImportItem`, `ImportItemResult` schemas
- **SVC SDK**: `memories.import(userId, input)` method on MemoriesResource (12 methods total, up from 11)
- Updated SVC client tests: byDensitySlice + import tests, method count assertion → 35

Version: 0.24.2 → 0.25.0

## [0.24.2] - 2026-03-04

### Added
- Process-level TTL cache (60s) for `ensureUserCollection`, `ensureSpacesCollection`, `ensureGroupCollection`, and `ensurePublicCollection` — skips redundant Weaviate `exists()` and `reconcileCollectionProperties()` calls on cache hit
- `clearCollectionCache()` export for testing and manual invalidation
- 6 new cache tests (hit, miss, TTL expiry, isolation, clear)

Version: 0.24.1 → 0.24.2

## [0.24.1] - 2026-03-03

### Added
- `byDensitySlice()` method on `MemoriesResource` svc client — REST wrapper for `POST /api/svc/v1/memories/by-density-slice`

Version: 0.24.0 → 0.24.1

## [0.24.0] - 2026-03-03

### Added
- **`searchByDensitySlice()`** — orchestrates parallel density-bucketed searches via MemoryService (Weaviate-direct), mirrors `searchByTimeSlice` but partitions by `relationship_count`
  - `buildGradedDensitySlices()` — 9 fixed ranges for desc (most-connected first): `[50+, 20-49, 10-19, 7-9, 5-6, 3-4, 2, 1, 0]`
  - `buildEvenDensitySlices()` — N equal-width integer buckets for asc (least-connected first)
  - `DensitySlice`, `DensitySliceSearchOptions`, `DensitySliceSearchResult`, `DensitySliceMemoryService` interfaces
  - `GRADED_DENSITY_BOUNDARIES`, `DENSITY_BUCKET_COUNT` constants
  - 24 new tests across 2 suites (bucket math + orchestration)
- `relationship_count_min` / `relationship_count_max` fields on `SearchFilters` (types + Weaviate filter builder)
- OpenAPI: `POST /api/svc/v1/memories/by-density-slice` endpoint, `DensitySliceSearchInput`/`DensitySliceSearchResult` schemas, `relationship_count_min/max` on `SearchFilters`

Version: 0.23.2 → 0.24.0

## [0.23.0] - 2026-03-03

### Added
- **`remember-core/search` subpath export** — time-slice search utilities for combining text search with chronological ordering
  - `searchByTimeSlice()` — orchestrates parallel time-bucketed searches via MemoryService (Weaviate-direct)
  - `buildGradedSlices()` — 14 exponentially-spaced buckets anchored at now (newest-first)
  - `buildEvenSlices()` — 14 equal-width buckets from oldest memory to now (oldest-first)
  - `TimeSlice`, `TimeSliceSearchOptions`, `TimeSliceSearchResult`, `TimeSliceMemoryService` interfaces
  - `GRADED_OFFSETS_MS`, `BUCKET_COUNT` constants
  - 24 new tests across 2 suites (bucket math + orchestration)

Completed Milestone 12: Time-Slice Search (3 tasks)
Version: 0.22.9 → 0.23.0

## [0.22.9] - 2026-03-03

### Fixed
- Fix manually built sort object in `selectCandidates()` (rem.clustering.ts) — used `order: 'desc'` instead of `ascending: false`
- Completes audit: all sort/filter/query calls now use Weaviate SDK builders

Version: 0.22.8 → 0.22.9

## [0.22.8] - 2026-03-03

### Fixed
- **PRODUCTION BLOCKER**: byTime() and byDensity() crash with `TypeError: Cannot read properties of undefined (reading 'map')`
  - Weaviate-client SDK expects `Sorting` instance (with `.sorts` array), but we passed plain object arrays
  - Mock accepted plain arrays so tests passed — masking the bug
  - Fix: use `collection.sort.byProperty()` to produce proper Sorting objects
- Updated weaviate mock `fetchObjects` to accept `Sorting` shape (`{ sorts: [...] }`) instead of plain arrays
- Added `sort.byProperty()` builder to mock collection for test fidelity

Completed Task 58: Fix Weaviate Sort API Crash in byTime and byDensity
Version: 0.22.7 → 0.22.8

## [0.22.5] - 2026-03-03

### Fixed
- Export TimeModeRequest, TimeModeResult, DensityModeRequest, and DensityModeResult types from services barrel
- Enables remember-rest-service to import and use sort mode types

Version: 0.22.4 → 0.22.5

## [0.22.4] - 2026-03-03

### Added
- **MemoryService.byDensity()** - Server-side sorting by relationship count
  - Sorts memories by relationship_count (highest first)
  - Discovers highly-connected "hub" memories
  - Uses Weaviate's native sort for optimal performance
  - Supports min_relationship_count filter
  - Supports pagination (limit/offset) and filters
  - Includes 5 comprehensive test cases
- **DensityModeRequest and DensityModeResult** interfaces for density sorting API

Completed Task 40: Add byDensity sort mode to MemoryService
Milestone: M11 - Basic Sort Modes (MVP) **COMPLETE** (5/5 tasks, 100%)
Version: 0.22.3 → 0.22.4

Phase 1 MVP Complete: Smart (hybrid search), Time (chronological), and Density (relationship-based) sort modes

## [0.22.3] - 2026-03-03

### Added
- **RelationshipService automatic relationship_count maintenance**
  - Added updateRelationshipCount() helper method
  - Increments relationship_count when creating relationships
  - Decrements relationship_count when deleting relationships
  - Ensures count never goes negative (floor at 0)
  - Graceful error handling (doesn't block relationship operations)
  - 4 comprehensive test cases (453 total tests passing)
- Updated insertMemory test helper to include relationship_count: 0

### Fixed
- Weaviate v3 API compatibility - use lessOrEqual instead of lessThanOrEqual

Completed Task 39: Update RelationshipService to maintain relationship_count
Milestone: M11 - Basic Sort Modes (MVP) (4/5 tasks, 80%)
Version: 0.22.2 → 0.22.3

## [0.22.2] - 2026-03-03

### Added
- **Backfill migration script** - scripts/migrations/backfill-relationship-count.ts
  - Populates relationship_count for all existing memories across all user collections
  - Uses Firestore collection registry for O(1) collection enumeration
  - Batch processing (100 memories per batch) for large collections
  - Idempotent (safe to re-run)
  - Progress logging (every 100 memories)
  - Graceful error handling (continues on individual failures)
- **Migration documentation** - scripts/migrations/README.md
  - Usage instructions and requirements
  - Common issues and solutions
  - Migration best practices checklist
- **npm script** - `migrate:backfill-relationship-count` for running the migration
- **ALL_MEMORY_PROPERTIES** - Added relationship_count to property fetch list

Completed Task 38: Backfill relationship_count for existing memories
Milestone: M11 - Basic Sort Modes (MVP) (3/5 tasks, 60%)
Version: 0.22.1 → 0.22.2

## [0.22.1] - 2026-03-03

### Added
- **Memory.relationship_count** - Denormalized property for efficient density sorting
  - Added to Memory interface in memory.types.ts
  - Added to Weaviate schema (COMMON_MEMORY_PROPERTIES) as INT type
  - Initialized to 0 for all new memories in MemoryService.create()
  - Will be maintained by RelationshipService (Task 39)
  - Enables server-side sorting by relationship density

### Fixed
- Updated test helpers to include relationship_count property
  - Fixed createTestMemory() in trust-enforcement.service.spec.ts
  - Fixed createTestMemory() in access-control.service.spec.ts

Completed Task 37: Add relationship_count property to Memory schema
Milestone: M11 - Basic Sort Modes (MVP) (2/5 tasks, 40%)
Version: 0.22.0 → 0.22.1

## [0.22.0] - 2026-03-03

### Added
- **MemoryService.byTime()** - Server-side chronological sorting by created_at
  - Sorts memories by creation date (ascending or descending)
  - Uses Weaviate's native sort for optimal performance
  - Supports pagination (limit/offset) and filters
  - Includes 4 comprehensive test cases
- **TimeModeRequest and TimeModeResult** interfaces for chronological sorting API
- **Weaviate mock sort support** - fetchObjects now handles sort parameter for testing

### Changed
- Updated Weaviate mock to support sort parameter in fetchObjects method

Completed Task 36: Add byTime sort mode to MemoryService
Milestone: M11 - Basic Sort Modes (MVP) (1/5 tasks, 20%)
Version: 0.21.1 → 0.22.0

## [0.21.1] - 2026-03-03

### Changed
- **CRITICAL: Aggressive sub-cluster extraction** - completely rewrote Haiku validation prompt to salvage relationships from heterogeneous clusters
  - **Problem**: Greedy clustering can produce heterogeneous groups (21 memories that are 75%+ similar to a seed, but not all similar to each other)
  - **Old behavior**: Haiku rejected entire cluster if not 100% cohesive → false negatives
  - **New behavior**: Haiku aggressively splits clusters into 2+ sub-groups when appropriate
  - **Three-tier decision**: (1) Accept all if cohesive, (2) **Split into sub-clusters** if heterogeneous, (3) Reject only if nothing relates
  - **Directive**: "AGGRESSIVELY look for sub-clusters. It's better to create 2-3 small relationships than reject everything."
  - Examples: 10 dog + 8 cat memories → 2 sub-clusters; 5 comedy shows + 4 YouTube links → 1-2 sub-clusters
  - Existing RemService code (lines 196-224) already handles `sub_clusters` response format
  - This maximizes recall without sacrificing precision

### Added
- **remember-rem CLI args** for REM config tuning:
  - `--auto-approve=0.85` - auto-approve similarity threshold (0.0-1.0, default 0.9)
  - `--similarity=0.70` - base clustering similarity threshold (0.0-1.0, default 0.75)
  - `--seed-count=5` - LLM-enhanced seed count (default 2)
  - `--batch=50` - max candidates per run (default 30)
  - Config values now logged in "REM Config" section for transparency

## [0.21.0] - 2026-03-03

### Changed
- **BREAKING**: Default validation model upgraded from Haiku 4.5 to Sonnet 4.6
  - Haiku 4.5 was too conservative, rejecting obviously related memories (comedy events, dog photos, song revisions)
  - Sonnet 4.6 has better reasoning for relationship detection
  - Can override with `model: 'claude-haiku-4-5-20251001'` in HaikuClient options for cost savings

### Added
- **Auto-approve high-similarity clusters** - bypass LLM validation for obviously related memories
  - New config: `auto_approve_similarity` (default 0.9 = 90%+ similarity)
  - Clusters above threshold are automatically approved without Haiku validation
  - Reduces false negatives from conservative LLM
  - Tagged with `['auto-approved', 'high-similarity']` for tracking
  - Logs similarity score and threshold for transparency

### Fixed
- Log avg_similarity in cluster evaluation messages for better debugging

## [0.20.2] - 2026-03-03

### Changed
- **Enhanced Haiku validation prompt** with additional relationship patterns:
  - Added "hub-and-spoke" relationships (main topic + related activities/tools/resources)
  - Added "creative format" recognition (poems, lyrics, quotes by structure/rhythm/style)
  - New examples: Airbnb hosting + house photography + booking tools
  - New examples: Creative content iterations (poem/lyric variations)
  - Expanded "be generous" guidance to accept implicit connections and supporting activities
  - Clarified that 1-2 tangential memories in an otherwise related cluster is acceptable

## [0.20.1] - 2026-03-03

### Fixed
- **CRITICAL**: Improved Haiku validation prompt to reduce false negatives
  - Added explicit criteria for valid relationships (common topic, entities, timeframe, activity)
  - Provided concrete examples of what SHOULD pass (comedy events, dog photos, song revisions)
  - Added "be generous" instruction to lean toward accepting clear connections
  - Changed from vague "meaningful group" to specific relationship patterns
- **Deduplicate before Haiku validation** — filter out duplicate memories (by first 200 chars) before sending to Haiku to avoid confusion from repeated content
- **Better rejection logging** — now logs actual Haiku rejection reason instead of generic message, and logs duplicate-only clusters separately

### Changed
- Skip Haiku validation entirely if cluster only contains duplicates (< 2 unique memories after deduplication)

## [0.20.0] - 2026-03-03

### Added
- **Multi-strategy candidate selection** — "big soup of strategies" approach combining traditional and LLM-enhanced search:
  - **Traditional strategies** (reduced from 1/3 to 1/6 each):
    - Newest memories (sorted by created_at desc)
    - Unprocessed memories (created_at > cursor)
    - Random sampling (random offset)
  - **LLM-enhanced semantic search** (NEW):
    - Pick N random seed memories (configurable: `seed_count`, default 2)
    - For each seed, use Haiku to extract: keywords, topics, themes, summary
    - Perform separate nearText vector search for EACH extraction type (4 searches per seed)
    - Finds semantically related memories across multiple abstraction levels
  - New config: `seed_count` (default 2), `candidates_per_seed_strategy` (default 5)
  - Architecture documented in rem.clustering.ts with detailed strategy breakdown

### Changed
- **HaikuClient interface extended** — added `extractFeatures()` method for memory feature extraction
- **HaikuExtraction type** — defines structure for keywords, topics, themes, summary
- **selectCandidates() signature** — now requires `config: RemConfig` and `haikuClient: HaikuClient` parameters
- **Log message renamed** — "Candidate selection complete" → "Multi-strategy candidate selection complete" with expanded stats

### Fixed
- All tests updated for new selectCandidates() signature (441 tests passing)

## [0.19.14] - 2026-03-03

### Fixed
- **CRITICAL**: Fix Weaviate filter combination syntax — use `Filters.and()` instead of `.and()` method which doesn't exist in Weaviate client v3 API. This caused "TypeError: collection.filter.byProperty(...).equal(...).and is not a function" error when fetching unprocessed memories.

## [0.19.13] - 2026-03-03

### Added
- **Enhanced candidate selection logging** — add INFO-level logs showing query results from each source:
  - Log requested limit for each source (newest, unprocessed, random)
  - Log actual count returned from each Weaviate query
  - Show deduplication results (deduped_from count)
  - Helps diagnose when batch size isn't respected (e.g., requesting 500 but getting 23)

## [0.19.12] - 2026-03-03

### Changed
- **CRITICAL**: Pass full memory content to Haiku for validation instead of truncated 200-char summaries
  - Renamed `content_summary` field to `content` in HaikuValidationInput (more accurate)
  - Removed double truncation (RemService + createHaikuClient both truncated to 200 chars)
  - Updated prompt to say "memories" instead of "memory summaries"
  - Haiku now receives complete memory content for better relationship validation decisions

## [0.19.11] - 2026-03-03

### Fixed
- **CRITICAL**: Fix candidate selection bug in `selectCandidates()` — properly combine doc_type and created_at filters for unprocessed query. Previously, the unprocessed query ignored the cursor filter and fetched duplicate memories, causing massive deduplication (e.g., requesting 500 candidates but only getting ~20 unique ones). Now properly filters for memories created after cursor, ensuring batch size is respected.

## [0.19.10] - 2026-03-03

### Added
- **Enhanced Haiku validation logging** — show memory titles and full Haiku reasoning:
  - Before validation: log all memory titles (first line/60 chars) in cluster
  - After rejection: log reason for rejection
  - After validation: log full Haiku response (observation, confidence, strength, tags, relationship_type)
- Changed Haiku validation logs from debug to info level for better visibility

## [0.19.9] - 2026-03-03

### Added
- Log collection size before processing begins — shows `total_memories` count after size check, before candidate selection

## [0.19.8] - 2026-03-03

### Added
- **Enhanced clustering progress logging** — added logger parameter to `selectCandidates()` and `formClusters()` with detailed progress tracking:
  - Candidate selection: logs each source query (newest, unprocessed, random) and summary with source counts
  - Cluster formation: logs start, progress every 10%, and completion summary with deduplication stats
  - Prevents "frozen" appearance when processing large batches (e.g., 5000 candidates)

### Changed
- Remove duplicate logging from RemService — clustering functions now handle their own logging

## [0.19.7] - 2026-03-03

### Fixed
- **CRITICAL**: Fix Weaviate sort parameter structure in selectCandidates — wrap sort array in `sorts` property (`{ sorts: [{ property, order }] }`) as expected by Weaviate client v3.11.0 API. Previous fix used array format but client expects `args.sort.sorts` accessor.

## [0.19.6] - 2026-03-03

### Fixed
- **CRITICAL**: Fix Weaviate sort parameter format in selectCandidates — use array format `[{ property, order }]` instead of object format `{ property, order }` to avoid "Cannot read properties of undefined (reading 'map')" error in Weaviate client v3.11.0

## [0.19.5] - 2026-03-03

### Added
- **Enhanced REM logging** — 8 new structured log statements in RemService for full observability:
  - Cursor state on load (last_collection_id, last_run_at)
  - Collection selection details (advanced_from, is_same_collection, wrap_around)
  - Memory candidate count and cursor position
  - Cluster formation progress (count, avg_cluster_size)
  - Haiku validation results (accept/reject with cluster details)
  - Cursor advancement confirmation
  - Cycle complete with duration_seconds
  - Logging test verifying all key log points

## [0.19.4] - 2026-03-03

### Fixed
- **CRITICAL**: Fix Firestore path construction in RemStateStore — use flat structure in `{BASE}.rem_state` collection (both cursor and collection state documents in same collection) instead of invalid `/collections` subcollection path to avoid "odd number of path components" error

## [0.19.3] - 2026-03-02

### Fixed
- uuid added to dependencies
- Remove `merge: true` in GhostService (dependency bug)

## [0.19.2] - 2026-03-02

### Changed
- Move REM source files from `src/rem/` into `src/services/` (flat) — REM files are services and belong alongside other services
- Rewrite `src/rem/index.ts` as thin re-export barrel pointing to `src/services/rem.*.ts`
- Add REM exports to `src/services/index.ts` so REM is also available through main entry point

## [0.19.1] - 2026-03-02

### Fixed
- Export `SPACE_CONTENT_TYPE_RESTRICTIONS` and `SPACE_DESCRIPTIONS` from types barrel
- Enforce content_type restrictions in `SpaceService.publish()` — restricted spaces now reject memories with wrong content_type

## [0.19.0] - 2026-03-02

### Added
- New `'profile'` content type for user profiles published to the profiles space
- `profile` metadata entry in `CONTENT_TYPE_METADATA`
- 18 new space IDs: ghosts, poems, recipes, quotes, dreams, travel, music, pets, books, funny, ideas, art, fitness, how_to, movies, nature, journal
- `SPACE_CONTENT_TYPE_RESTRICTIONS` — per-space content type restrictions (profiles → profile, ghosts → ghost)
- `SPACE_DESCRIPTIONS` — human-readable descriptions for all spaces (for GUI discovery)
- Display names for all new spaces in `SPACE_DISPLAY_NAMES`

## [0.18.0] - 2026-03-02

### Added
- **Firestore Collection Registry** — O(1) cursor-based collection lookup replacing Weaviate `listAll()`:
  - New `src/database/collection-registry.ts` module with `registerCollection()`, `getNextRegisteredCollection()`, `unregisterCollection()`
  - `getCollectionRegistryPath()` Firestore path helper
  - `getNextMemoryCollection()` replaces `listMemoryCollections()` in REM pipeline
  - `ensure*Collection()` functions now register collections in Firestore on creation
  - 8 new collection registry unit tests (CRUD, cursor, wrap-around)
  - Updated REM collections and service tests for registry-based lookups

### Changed
- **BREAKING**: `listMemoryCollections()` export removed from `./rem`, replaced by `getNextMemoryCollection(afterName)`
- `RemService.runCycle()` simplified — single cursor query instead of load-all-then-indexOf

## [0.17.0] - 2026-03-02

### Added
- **REM (Relationship Engine for Memories)** — M10 complete (8 tasks), background relationship discovery engine:
  - New `source` field on `Relationship` type (`'user' | 'rem' | 'rule'`)
  - `RelationshipService.findByMemoryIds()` method for overlap detection
  - `computeOverlap()` utility for deduplication ratio calculation
  - New `src/rem/` module with full REM pipeline:
    - `RemService.runCycle()` — orchestrates collection selection, clustering, validation, and relationship CRUD
    - `selectCandidates()` — memory selection from newest/unprocessed/random thirds
    - `formClusters()` — greedy agglomerative clustering via vector similarity
    - `resolveClusterActions()` — dedup against existing relationships (merge vs create)
    - `shouldSplit()` / `splitCluster()` — oversized relationship splitting
    - `listMemoryCollections()` — Weaviate collection enumeration
    - `RemStateStore` — Firestore cursor and per-collection state persistence
    - `createHaikuClient()` / `createMockHaikuClient()` — Haiku LLM validation gate
  - `RemConfig` and `DEFAULT_REM_CONFIG` configuration
  - `./rem` subpath export for Cloud Run consumer
  - Firestore path helpers: `getRemCursorPath()`, `getRemCollectionStatePath()`
  - 24 new REM unit tests (clustering, collections, service orchestration)
  - 9 new RelationshipService tests (findByMemoryIds, computeOverlap)
  - Weaviate mock enhancements: `aggregate.overAll()`, `collections.listAll()`, `greaterThan` filter

## [0.16.5] - 2026-03-01

### Fixed
- Remove `deleted_at` filter from SpaceService search — space/group memories use retraction model (remove groupId from `group_ids`), not soft-delete

## [0.16.4] - 2026-03-01

### Fixed
- Use `fetchObjects()` instead of `bm25('*')` for wildcard search — BM25 treats `*` as a literal token, not a wildcard match-all

## [0.16.3] - 2026-03-01

### Fixed
- Gracefully handle collections without `indexNullState` — retry search/similar/query without `deleted_at` filter when Weaviate returns "Nullstate must be indexed" error

## [0.16.2] - 2026-03-01

### Fixed
- Use BM25 search for wildcard `*` queries instead of hybrid — vectorizing `*` fails on collections without a vectorizer configured

## [0.16.1] - 2026-03-01

### Fixed
- Schema migration for existing Weaviate collections — `ensureUserCollection`, `ensureSpacesCollection`, and `ensureGroupCollection` now reconcile missing properties on existing collections via `collection.config.addProperty()`
- Collections created before soft-delete fields (`deleted_at`, `deleted_by`, `deletion_reason`) were added to the schema will now have those properties added automatically on next access

### Added
- `reconcileCollectionProperties()` exported utility for standalone schema migration use cases

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
