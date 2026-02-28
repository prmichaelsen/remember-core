# Task 27: WebSDKContext and Factory

**Milestone**: M7 — Web Client SDK
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: Task 26 (foundation types)

---

## Objective

Create the `WebSDKContext` interface and `createWebSDKContext()` factory function that all use-case modules receive as their first parameter.

## Context

All web SDK functions accept an initialized context rather than managing connections. The context bundles the authenticated user ID, initialized services (MemoryService, SpaceService), ghost config provider, escalation store, and optional logger. The factory constructs this from raw infrastructure dependencies.

## Steps

1. Create `src/web/context.ts`:
   - `WebSDKContext` interface with fields:
     - `userId: string` — authenticated user
     - `memoryService: MemoryService` — initialized for user's collection
     - `spaceService: SpaceService` — initialized
     - `relationshipService?: RelationshipService` — optional (not all use cases need it)
     - `ghostConfigProvider: GhostConfigProvider` — Firestore-backed
     - `escalationStore: EscalationStore` — Firestore-backed
     - `confirmationTokenService: ConfirmationTokenService` — for space operations
     - `preferencesService?: PreferencesDatabaseService` — optional
     - `logger?: Logger` — optional
   - `CreateWebSDKContextOptions` interface for factory input
   - `createWebSDKContext(options)` factory function
   - Call `assertServerSide()` in factory

2. Factory should accept:
   - `userId: string`
   - `weaviateCollection: WeaviateCollection` — user's memory collection
   - `publicSpacesCollection?: WeaviateCollection` — for space operations
   - `firestoreDb?: FirebaseFirestore.Firestore` — for ghost config, escalation, preferences
   - `logger?: Logger`

3. Factory constructs services from raw dependencies, matching existing service constructors.

## Verification

- [ ] `WebSDKContext` interface has all required fields
- [ ] `createWebSDKContext()` returns valid context from raw dependencies
- [ ] Factory calls `assertServerSide()` (browser guard)
- [ ] Optional services (relationships, preferences) handled gracefully
- [ ] Types export cleanly from barrel
- [ ] Build passes

## Files

- Create: `src/web/context.ts`
