# Milestone 38: Response Envelope Migration

**Goal**: Migrate existing by* sort mode endpoints from flat `memories[]` response to the `{ memory, metadata }` envelope pattern established in M37
**Duration**: ~2 weeks (estimated)
**Dependencies**: M37 (byMyRatings Sort Mode)

---

## Overview

M37 introduces a new `{ memory, metadata }` response envelope for `byMyRatings`. This milestone migrates all other `by*` endpoints to the same pattern for consistency:

- `byRating` → add `metadata.rating_avg`, `metadata.rating_count`, `metadata.rating_bayesian`
- `byDiscovery` → add `metadata.discovery_score` or similar
- `byBroad` → add `metadata` (minimal, possibly empty)
- `byRandom` → add `metadata` (minimal, possibly empty)
- `byCurated` → add `metadata.curated_score`, `metadata.sub_scores`

## Status

**Placeholder** — tasks will be defined when M37 is complete and the envelope pattern is proven.

## Key Decisions

- Backward compatibility strategy (breaking change vs. opt-in envelope)
- Whether to version the API or use a response format parameter
- Which metadata fields to surface per sort mode
- Client SDK migration path

---

## Tasks

Tasks TBD — will be planned after M37 implementation validates the envelope pattern.
