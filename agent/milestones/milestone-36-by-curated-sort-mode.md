# Milestone 36: byCurated Sort Mode

**Status**: Not Started
**Estimated Duration**: 3 weeks
**Dependencies**: M10 (REM Background Relationships), M20 (Memory Ratings), M28 (REM Emotional Weighting)
**Design Reference**: [byCurated Sort Mode](../design/local.by-curated-sort-mode.md)

---

## Goal

Implement a hybrid algorithmic sort mode that combines six quality signals (editorial quality, cluster quality, graph centrality, user ratings, recency, engagement) into a single pre-computed `curated_score`, updated during REM background cycles. At query time, `byCurated` is a native Weaviate sort — zero runtime computation.

## Key Deliverables

1. **Schema migration**: 5 new Weaviate properties (`curated_score`, `editorial_score`, `click_count`, `share_count`, `comment_count`)
2. **Sub-score functions**: 6 independent, tested pure functions (one per signal)
3. **Haiku editorial evaluation**: One-time per-memory quality scoring via Haiku sub-LLM
4. **Composite scoring**: Weighted combination (w1-w6 sum to 1.0) + Firestore sub-score storage
5. **REM integration**: Curation scoring as Step 5 in REM cycle
6. **byCurated sort mode**: MemoryService + SpaceService methods with search query re-ranking and unscored interleaving
7. **Engagement counters**: Increment endpoints for click/share/comment counts
8. **SVC client + API**: Client methods, OpenAPI spec updates

## Success Criteria

- `curated_score` computed for all memories in REM-eligible collections (≥50 memories)
- `byCurated` returns memories sorted by composite score DESC
- `byCurated` with search query re-ranks hybrid search results by curated_score
- Unscored memories interleaved at 4:1 ratio (same as byDiscovery)
- Sub-score breakdown available via Firestore for API transparency
- Editorial evaluation is permanent (once per memory, never re-evaluated)
- All sub-score functions unit tested independently
- Engagement counters increment atomically

## Tasks

| Task | Name | Est. Hours |
|------|------|-----------|
| 179 | Schema Migration + Sub-Score Functions | 4 |
| 180 | Haiku Editorial Evaluation Service | 4 |
| 181 | Composite Curation Scoring + Firestore Storage | 3 |
| 182 | REM Curation Step Integration | 4 |
| 183 | byCurated Sort Mode (MemoryService + SpaceService) | 4 |
| 184 | Engagement Counters + SVC Client | 3 |
