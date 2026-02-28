# Milestone 7: Web Client SDK

**Goal**: Create `@prmichaelsen/remember-core/web` subpath export — use-case-oriented server-side SDK for web apps
**Duration**: 1-2 weeks
**Dependencies**: M1-M6 (all complete)
**Status**: Not Started

---

## Overview

The web client SDK provides use-case-oriented server-side functions for web applications consuming Remember services. Unlike the existing service layer (1:1 database operations), the web SDK bundles multi-step business logic into single calls optimized for web app consumption.

The first customer is agentbase.me, which currently performs manual orchestration across multiple remember-core services (e.g., 3 separate calls for publishing a profile). The web SDK collapses these into single RPC-style operations.

Key architectural decisions:
- **Server-side only** — runtime browser guard prevents credential exposure
- **Framework-agnostic** — works with TanStack Start, Next.js, Express, Hono
- **Result<T, E> return type** — all operations return discriminated unions
- **Aligned with OpenAPI** — error envelope, pagination, field naming match REST API specs
- **Ghost context resolved internally** — consumers don't need to manage trust levels

---

## Deliverables

### 1. Foundation
- `Result<T, E>` type + `ok()`, `err()`, `tryCatch()` helpers
- `WebSDKError` type matching OpenAPI `ErrorResponse.error` shape (8 error kinds)
- `assertServerSide()` browser guard
- `WebSDKContext` interface + `createWebSDKContext()` factory

### 2. Use-Case Modules
- `memories.ts` — CRUD + search/query/similar (6 functions)
- `relationships.ts` — CRUD + search (4 functions)
- `spaces.ts` — publish/retract/revise (auto-confirmed), moderate, search, query (7 functions)
- `ghost.ts` — ghost config, trust management, checkAccess, searchAsGhost (8 functions)
- `profiles.ts` — compound create+publish, update+republish, retract, search (4 functions)
- `preferences.ts` — get, update (2 functions)

### 3. Package Configuration
- `src/web/index.ts` barrel exports
- `package.json` exports entry for `@prmichaelsen/remember-core/web`
- `tsconfig.json` path inclusion

### 4. Tests
- Unit tests for all use-case modules (40-60 tests)
- Browser guard test
- Result type helpers test

### 5. Documentation
- Updated README.md with `/web` subpath
- Updated migration guide with web SDK examples
- CHANGELOG.md entry

---

## Success Criteria

- [ ] `import { createAndPublishProfile } from '@prmichaelsen/remember-core/web'` resolves correctly
- [ ] All 31 use-case functions implemented and exported
- [ ] All functions return `Result<T, WebSDKError>`
- [ ] Space operations auto-confirm (no confirmation tokens exposed)
- [ ] searchAsGhost resolves trust level internally
- [ ] Browser guard throws when `window` is defined
- [ ] 40+ new tests pass
- [ ] Build succeeds with no type errors
- [ ] Design doc and OpenAPI spec alignment verified

---

## Tasks

| Task | Name | Est. Hours | Dependencies |
|------|------|-----------|-------------|
| 26 | Foundation: Result type, WebSDKError, browser guard | 2 | — |
| 27 | WebSDKContext and factory | 2 | Task 26 |
| 28 | Memory use cases | 3 | Task 27 |
| 29 | Relationship use cases | 2 | Task 27 |
| 30 | Space use cases (collapsed confirmations) | 3 | Task 27 |
| 31 | Ghost/Trust use cases + searchAsGhost | 3 | Task 27 |
| 32 | Profile compound use cases | 3 | Tasks 28, 30 |
| 33 | Preferences use cases + barrel exports + subpath config | 2 | Task 27 |
| 34 | Unit tests | 4 | Tasks 28-33 |
| 35 | Update docs (migration guide, CHANGELOG, README) | 2 | Task 34 |

**Total**: ~26 hours estimated

---

## Design References

- [Design Doc: local.web-client-sdk.md](../design/local.web-client-sdk.md)
- [Clarification: client-sdk-web-first](../clarifications/clarification-1-client-sdk-web-first.md)
- [OpenAPI svc tier: openapi.yaml](../../docs/openapi.yaml)
- [OpenAPI web tier: openapi-web.yaml](../../docs/openapi-web.yaml)

---

## Notes

- All functions compose existing remember-core services in-process (not via HTTP)
- Snake_case field names throughout (matches OpenAPI schemas)
- Error kinds match REST API exactly: validation, not_found, unauthorized, forbidden, conflict, rate_limit, external, internal
- Pagination uses offset-based `{ total, offset, limit, hasMore }`
- Version bump: minor (0.15.0) — new feature, backward compatible
