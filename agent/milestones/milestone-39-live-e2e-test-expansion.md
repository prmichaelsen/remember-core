# Milestone 39: Live E2E Test Expansion

**Goal**: Expand live e2e test suite to cover endpoints added since M24 (Live E2E Test Coverage), including byMyRatings, byCurated, byDiscovery, byRecommendation, and other untested sort modes
**Duration**: ~0.5 weeks
**Dependencies**: M37 (byMyRatings Sort Mode), M24 (Live E2E Test Coverage)

---

## Overview

M24 established the live e2e test suite (`test/live/suites/`) covering health, memories, preferences, relationships, spaces, trust, sort modes (byTime, byDensity, byRating), ratings (rate, getMyRating, retractRating), comments, and space sort modes. Since then, several new endpoints have been added without corresponding live tests:

- `POST /api/svc/v1/memories/by-my-ratings` (M37)
- `POST /api/svc/v1/memories/by-curated` (M36)
- `POST /api/svc/v1/memories/by-discovery` (M25)
- `POST /api/svc/v1/memories/by-recommendation` (M27)

This milestone adds live e2e coverage for these endpoints against the deployed e1 REST service.

---

## Status

**Not Started**

## Success Criteria

- [ ] byMyRatings live test: browse mode returns { memory, metadata } envelope
- [ ] byMyRatings live test: search mode with query returns filtered results
- [ ] byMyRatings live test: star filter works (rating_filter)
- [ ] byCurated live test: returns results sorted by curated_score
- [ ] byDiscovery live test: returns results with discovery interleaving
- [ ] byRecommendation live test: returns results or graceful fallback
- [ ] All new tests pass against deployed e1 service
- [ ] Existing live tests remain green

---

## Tasks

| Task | Name | Est. Hours |
|------|------|-----------|
| 191 | byMyRatings Live E2E Tests | 2 |
| 192 | Sort Mode Expansion Live E2E Tests (byCurated, byDiscovery, byRecommendation) | 2 |

---

**Next Milestone**: M38 — Response Envelope Migration (or next planned)
**Blockers**: byMyRatings endpoint must be deployed to e1
**Notes**: Live tests use SVC client against deployed e1 REST service. Tests are graceful (warn on expected errors, don't hard-fail on empty results).
