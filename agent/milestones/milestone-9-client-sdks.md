# Milestone 9: Client SDKs (Svc + App)

**Goal**: Create typed REST client SDKs — `remember-core/clients/svc/v1` (1:1 route mirror) and `remember-core/app` (use-case compound operations)
**Duration**: 2 weeks
**Dependencies**: M7 (reference code), `docs/openapi.yaml`, `docs/openapi-web.yaml`
**Status**: Not Started

---

## Overview

Two client SDKs that wrap the remember-rest-service REST API with typed inputs/outputs, authentication, and Supabase-style error handling (`{ data, error }` + `.throwOnError()`). Both are server-side only (browser guard).

The current `remember-core/web` (M7) called core services directly — wrong architecture. The `/web` export is replaced by `/app`, which uses `fetch()` to call REST endpoints. The svc client provides granular 1:1 access to all `/api/svc/v1/` routes.

**Design doc**: `agent/design/local.client-sdk-architecture.md`
**Clarifications**: 1-4 (all completed)

---

## Deliverables

### 1. Shared Client Infrastructure
- `HttpClient` with fetch, auth (either/or: serviceToken JWT or getAuthToken callback), baseUrl
- `SdkResponse<T>` with `{ data, error }` + `.throwOnError()` (Supabase-style)
- `RememberError` with `.code`, `.message`, `.status`
- `assertServerSide()` browser guard (reuse from existing)
- `jsonwebtoken` as optional peer dependency

### 2. Type Generation
- `openapi-typescript` generates types from `docs/openapi.yaml` → svc types
- `openapi-typescript` generates types from `docs/openapi-web.yaml` → app types
- Types committed to source, regenerated when specs change

### 3. Svc Client (`remember-core/clients/svc/v1`)
- `createSvcClient(config)` factory
- Resource groups: memories (6), relationships (4), spaces (6), confirmations (2), preferences (2), trust (7), health (2) = **29 methods**
- 1:1 mirror of `/api/svc/v1/` routes
- No auto-confirm (two-phase: publish → confirm)

### 4. App Client (`remember-core/app`)
- `createAppClient(config)` factory
- Profile compounds: createAndPublishProfile, searchProfiles, retractProfile, updateAndRepublishProfile
- Ghost compounds: searchAsGhost
- **5 methods** (initially, grows with app-tier routes)
- No auto-confirm

### 5. OpenAPI Spec Updates
- Rename `openapi-web.yaml` tier from `web` → `app`
- Remove "confirmation-free" language
- Add confirmation token returns to space operations

### 6. Replace `src/web/`
- Remove old direct-service M7 code
- Update package.json exports: `./web` → `./app`, add `./clients/svc/v1`

### 7. Documentation
- CHANGELOG.md v0.16.0
- README.md client SDK section
- Migration guide client SDK examples

---

## Success Criteria

- [ ] `npm run build` compiles with new exports
- [ ] All tests pass (new + existing)
- [ ] Generated types match OpenAPI spec shapes
- [ ] `createSvcClient` methods map 1:1 to svc REST routes (29 methods)
- [ ] `createAppClient` compound operations work (5 methods)
- [ ] Auth: both serviceToken and getAuthToken patterns verified
- [ ] `throwOnError()` throws, default returns `{ data, error }`
- [ ] Browser guard prevents client-side usage
- [ ] agentbase.me can migrate from hand-written fetch to app client

---

## Task Breakdown

| Task | Name | Est. Hours |
|------|------|-----------|
| 37 | Install openapi-typescript + generate types | 2 |
| 38 | Build shared client infrastructure (http, response, guard) | 4 |
| 39 | Build svc client — memories + relationships resources | 4 |
| 40 | Build svc client — spaces + confirmations resources | 3 |
| 41 | Build svc client — preferences + trust + health resources | 3 |
| 42 | Build svc client — factory + barrel + tests | 3 |
| 43 | Build app client — profiles + ghost + factory | 4 |
| 44 | Update OpenAPI spec + replace src/web/ + package.json exports | 3 |
| 45 | Tests for all client modules | 4 |
| 46 | Documentation (CHANGELOG, README, migration guide) | 2 |

**Total**: ~32 hours across 10 tasks
