# Task 133: Wire byDiscovery into MemoryService + SVC Client + OpenAPI

**Milestone**: M25 — byDiscovery Sort Mode
**Estimated Time**: 1-2 hours
**Dependencies**: Task 132
**Status**: Not Started

---

## Objective

Add `byDiscovery()` method to MemoryService (personal collections), the SVC client, and OpenAPI spec — matching the pattern of `byTime`, `byDensity`, `byRating`.

---

## Context

Sort modes in this codebase are separate methods on MemoryService (`byTime()`, `byDensity()`, `byRating()`) with corresponding REST endpoints (`/memories/by-time`, etc.) and SVC client methods. `byDiscovery` follows this same pattern.

SpaceService.search() sorts by relevance score, not by sort modes. Space discovery support (task 134) will need a different approach.

---

## Steps

### 1. Add DiscoveryModeRequest/Result types to MemoryService

Same pattern as TimeModeRequest/RatingModeRequest.

### 2. Add `byDiscovery()` method to MemoryService

Two parallel Weaviate queries:
- Rated: `rating_count >= 5`, sort by `rating_bayesian` DESC
- Discovery: `rating_count < 5`, sort by `created_at` DESC
Merge with `interleaveDiscovery()`, map to response with `is_discovery` flag.

### 3. Add `byDiscovery` to SVC client

Add method to MemoriesResource interface and implementation:
`POST /api/svc/v1/memories/by-discovery`

### 4. Add endpoint to OpenAPI spec

Add `/api/svc/v1/memories/by-discovery` to `docs/openapi.yaml`.

### 5. Export types from services index

---

## Verification

- [ ] `byDiscovery()` method on MemoryService
- [ ] DiscoveryModeRequest/Result types exported
- [ ] SVC client `byDiscovery()` method
- [ ] OpenAPI spec updated with new endpoint
- [ ] Existing sort modes unaffected
