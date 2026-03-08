# Milestone 40: Live E2E Test Coverage Expansion

**Goal**: Expand live e2e test suite from 45% to ~85% method coverage across SVC + App clients, covering all high and medium priority gaps identified in the coverage audit
**Duration**: ~1 week
**Dependencies**: M39 (Live E2E Test Expansion)

---

## Overview

An audit of the live e2e test suite found 33 untested methods out of 60 total across SVC and App clients (45% coverage). M39 added byMyRatings and sort mode tests. This milestone covers the remaining high and medium priority gaps:

- **SVC Client**: memories.get/similar/query, relationships.update, preferences.update, trust operations (block/unblock/checkAccess/updateGhostConfig), spaces (revise/query/byDiscovery/byRecommendation/byCurated), health.version, confirmations.deny
- **App Client**: profiles (createAndPublish/search/retract/updateAndRepublish), memories.get, relationships.getMemories, ghost.searchAsGhost

Low priority items (analytics increments, import/jobs, time/density slices) are deferred.

---

## Status

**Not Started**

## Success Criteria

- [ ] memories.get(), similar(), query() tested
- [ ] relationships.update() tested
- [ ] preferences.update() tested
- [ ] trust.updateGhostConfig(), blockUser(), unblockUser(), checkAccess() tested
- [ ] spaces.revise(), query(), byDiscovery(), byRecommendation(), byCurated() tested
- [ ] app.profiles.* (4 methods) tested
- [ ] app.memories.get(), app.relationships.getMemories(), app.ghost.searchAsGhost() tested
- [ ] health.version(), confirmations.deny() tested
- [ ] All new tests pass against deployed e1 service
- [ ] Existing live tests remain green

---

## Tasks

| Task | Name | Est. Hours |
|------|------|-----------|
| 193 | Memory Get + Similar + Query Live Tests | 2 |
| 194 | Relationship Update + Preferences Update Live Tests | 1 |
| 195 | Trust Operations Expansion Live Tests | 2 |
| 196 | Spaces Revise + Query + Sort Modes Live Tests | 2 |
| 197 | App Client Profiles Live Tests | 2 |
| 198 | App Client Memory + Relationships + Ghost Live Tests | 2 |
| 199 | Health Version + Confirmations Deny Live Tests | 1 |

---

**Blockers**: All endpoints must be deployed to e1
**Notes**: Tests follow graceful error pattern (warn on expected errors). App client tests use `test/live/helpers/app-client.ts`.
