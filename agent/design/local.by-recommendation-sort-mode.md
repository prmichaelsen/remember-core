# byRecommendation Sort Mode

**Concept**: Personalized sort mode that uses a user's rating history to surface similar content via vector search, regardless of engagement — inspired by SoundCloud Boost
**Created**: 2026-03-05
**Status**: Approved (Clarification 16 completed)

---

## Overview

`byRecommendation` generates a personalized feed by analyzing what a user has rated highly and using vector similarity to find other memories that match those preferences. Unlike engagement-based recommendation (which requires many users to interact before content can be recommended), this approach works from a single user's explicit quality signals and can surface content with zero engagement.

This is modeled after SoundCloud's Boost algorithm: find what you like, find things similar to what you like, surface them even if nobody else has heard them yet.

---

## Problem Statement

- **Engagement chicken-and-egg**: Traditional recommendation systems need aggregate engagement data (views, clicks, ratings from many users) before they can recommend content. New or niche content with zero engagement is invisible to these systems.
- **Generic ranking isn't personal**: `byRating` shows the same top-rated memories to everyone. `byRecommendation` shows different content to different users based on their individual taste.
- **Existing vector infrastructure underutilized**: Every memory already has an embedding vector in Weaviate. The system already supports vector similarity search (`findSimilar`). But there's no feature that uses a user's preference signal to drive vector queries.
- **Quality without popularity**: A memory might be exactly what a specific user needs, but if it hasn't been rated by many people, it won't appear in `byRating`. `byRecommendation` bypasses popularity entirely — it finds quality through similarity to known preferences.

---

## Solution

### High-Level Approach

1. **Build preference profile**: Aggregate embeddings of memories the user rated 4-5 stars (positive centroid), subtract 1-2 star embeddings (negative signal)
2. **Vector search**: Use the adjusted preference vector to find similar memories
3. **Filter out known**: Exclude memories the user has already rated AND the user's own memories
4. **Return results**: Ranked by vector similarity to the user's taste, with minimum similarity threshold of 0.3

### Architecture

```
User's rating history (Firestore)
  │
  ├── Fetch highly-rated memories (4-5 stars, up to 500)
  │     → positive centroid (average of vectors)
  │
  ├── Fetch low-rated memories (1-2 stars)
  │     → negative centroid (average of vectors)
  │
  ▼
Adjusted preference vector = positive centroid - (weight * negative centroid)
  │
  ▼
Check Firestore cache for centroid
  │  ├── Cache hit → use cached centroid
  │  └── Cache miss → compute, store in Firestore
  │
  ▼
Vector search: nearVector(adjusted centroid)
  │  ├── Exclude: memories user already rated
  │  ├── Exclude: user's own memories
  │  ├── Filter: minimum similarity >= 0.3
  │  └── Optional: standard SearchFilters (content type, date range, etc.)
  │
  ▼
Ranked results (by cosine similarity to centroid)
  │  └── Similarity exposed as percentage badge (e.g., "92%")
  │
  ▼
If insufficientData (< 5 highly-rated): fallback to byDiscovery
  └── Response includes fallback_sort_mode indicator
```

### Preference Centroid

Average the embedding vectors of memories the user rated 4 or 5 stars (positive signal), then subtract a weighted average of 1-2 star embeddings (negative signal) to push the centroid away from disliked content.

```typescript
// Pseudocode
const highlyRated = await getUserRatings(userId, { minRating: 4, limit: 500 });
const lowRated = await getUserRatings(userId, { maxRating: 2 });

const positiveCentroid = averageVectors(await getEmbeddings(highlyRated));
const negativeCentroid = averageVectors(await getEmbeddings(lowRated));

// Subtract negative signal (weight TBD, e.g. 0.3)
const centroid = subtractWeighted(positiveCentroid, negativeCentroid, NEGATIVE_WEIGHT);
```

This produces a vector that represents the "center" of the user's preferences, adjusted away from content they dislike. Memories near this centroid are semantically similar to things the user likes and dissimilar to things they don't.

### Alternative Approaches Considered

1. **Collaborative filtering** ("users who liked X also liked Y"): Requires many users with overlapping ratings. At Remember's scale, the rating matrix would be extremely sparse. Not viable for MVP.
2. **Content-based tags**: Recommend based on matching tags/content types. Less nuanced than vector similarity — tags are coarse labels, embeddings capture semantic meaning.
3. **Multiple centroids (clustering)**: Instead of one average vector, cluster the user's highly-rated memories into groups and query with multiple centroids. More accurate for users with diverse interests, but adds complexity. Future enhancement.
4. **Weighted centroid by rating**: Weight 5-star memories more than 4-star in the centroid calculation. Marginal benefit, adds complexity. Future enhancement.
5. **Recency-weighted centroid**: Weight recent ratings more than old ones (taste changes over time). Good idea but adds complexity. Future enhancement.

---

## Implementation

### Interface

```typescript
interface RecommendationModeRequest {
  userId: string;
  collectionName: string;
  /** Maximum results. Default: 20 */
  limit?: number;
  /** Standard filters (content type, date range, etc.) */
  filters?: SearchFilters;
  /** Optional text query for hybrid search (like byDiscovery) */
  query?: string;
}

interface RecommendationModeResult {
  memories: RecommendedMemory[];
  /** Number of highly-rated memories used to build preference profile */
  profileSize: number;
  /** True if user had too few ratings — results are from fallback sort mode */
  insufficientData: boolean;
  /** Set when insufficientData is true — indicates which sort mode was used instead */
  fallback_sort_mode?: 'byDiscovery';
}

interface RecommendedMemory extends Memory {
  /** Cosine similarity to user's preference centroid, as percentage (0-100) */
  similarity_pct: number;
}
```

### Query Flow

```typescript
async byRecommendation(input: RecommendationModeRequest): Promise<RecommendationModeResult> {
  // 1. Check cached centroid in Firestore
  let centroid = await this.getCachedCentroid(input.userId);

  if (!centroid) {
    // 2. Get user's highly-rated memory IDs from Firestore
    const highRatings = await this.getUserRatings(input.userId, { minRating: 4, limit: 500 });

    if (highRatings.length < MIN_PROFILE_SIZE) {
      // Fallback to byDiscovery
      const discoveryResults = await this.byDiscovery(input);
      return { ...discoveryResults, insufficientData: true, fallback_sort_mode: 'byDiscovery' };
    }

    // 3. Get negative signal (1-2 star ratings)
    const lowRatings = await this.getUserRatings(input.userId, { maxRating: 2 });

    // 4. Fetch embedding vectors from Weaviate (global — all collections)
    const positiveEmbeddings = await this.getEmbeddingsAcrossCollections(highRatings);
    const negativeEmbeddings = lowRatings.length > 0
      ? await this.getEmbeddingsAcrossCollections(lowRatings)
      : [];

    // 5. Compute adjusted preference centroid
    const positiveCentroid = this.averageVectors(positiveEmbeddings);
    const negativeCentroid = negativeEmbeddings.length > 0
      ? this.averageVectors(negativeEmbeddings)
      : null;
    centroid = negativeCentroid
      ? this.subtractWeighted(positiveCentroid, negativeCentroid, NEGATIVE_WEIGHT)
      : positiveCentroid;

    // 6. Cache centroid in Firestore
    await this.cacheCentroid(input.userId, centroid);
  }

  // 7. Vector search excluding already-rated + own memories
  const ratedIds = await this.getAllUserRatedIds(input.userId);
  const results = await collection.query.nearVector(centroid, {
    limit: input.limit ?? 20,
    filters: this.buildExclusionFilter(ratedIds, input.userId, input.filters),
    returnMetadata: ['distance'],
  });

  // 8. Filter by minimum similarity threshold and map results
  const MIN_SIMILARITY = 0.3;
  return {
    memories: results
      .map(r => ({ ...r, similarity_pct: Math.round((1 - r.metadata.distance) * 100) }))
      .filter(r => r.similarity_pct >= MIN_SIMILARITY * 100),
    profileSize: ratings.length,
    insufficientData: false,
  };
}
```

### Minimum Profile Size

`MIN_PROFILE_SIZE = 5`. If a user has rated fewer than 5 memories at 4-5 stars, return `insufficientData: true` and automatically fall back to `byDiscovery`. The response includes a `fallback_sort_mode` field indicating which sort mode was actually used.

### Cross-Collection Considerations

A user's highly-rated memories may span multiple Weaviate collections (their own, groups, spaces). The preference centroid should be built from all highly-rated memories regardless of collection. However, the vector search query targets a specific collection. This means:
- Centroid = built from embeddings across all collections the user has rated in
- Search = scoped to the requested collection
- Embedding vectors must be fetched per-collection (Weaviate has no cross-collection vector retrieval)

### Caching the Preference Centroid

**Decision**: Cache in Firestore. Store the computed centroid vector as a Firestore document per user. Invalidate only when the user submits a new 4-5 star rating (1-2 star ratings also affect the centroid via negative signal, but cache invalidation is scoped to high ratings for simplicity — negative signal changes are less impactful).

- On cache hit: read cached centroid, skip vector fetching entirely
- On cache miss/invalidation: fetch up to 500 highly-rated + all low-rated embeddings, compute adjusted centroid, store in Firestore
- Vector fetch cap: 500 (most recent highly-rated memories). With Firestore caching, this cost is amortized across requests.

---

## Benefits

- **Solves cold-start for consumers**: Even content with zero ratings can be recommended if it's semantically similar to what a user likes
- **Personalized**: Different users see different recommendations based on individual taste
- **Leverages existing infrastructure**: Weaviate embeddings + `nearVector` are already available. Firestore rating storage is already planned.
- **Quality-driven**: Based on explicit quality signals (ratings), not passive engagement. A memory recommended because it's similar to things you rated 5 stars, not because it went viral.
- **Independent of popularity**: Completely bypasses aggregate rating counts. A memory with 0 ratings can be surfaced if it matches the user's taste profile.

---

## Trade-offs

- **Cold-start for new users**: Users with no rating history get no recommendations. Must fall back to `byRating` or `byDiscovery`. Mitigated by `insufficientData` flag.
- **Centroid computation cost**: Fetching embeddings for all highly-rated memories is expensive. Mitigated by caching (Firestore or in-memory).
- **Single centroid is lossy**: A user who likes both "cooking recipes" and "software architecture" gets a centroid somewhere between the two — which may match neither well. Mitigated by future multi-centroid (clustering) enhancement.
- **Cross-collection complexity**: Building the centroid requires fetching vectors from multiple Weaviate collections. Adds implementation complexity.
- **Exclusion filter growth**: As users rate more memories, the exclusion set grows. Weaviate `containsAny` filters have practical limits. May need pagination or batch-based exclusion for prolific raters.
- **Embedding model dependency**: Recommendation quality depends entirely on embedding quality. If embeddings don't capture semantic meaning well, recommendations will be poor.

---

## Dependencies

- **Memory Ratings System** (`local.memory-ratings.md`): Individual ratings in Firestore, `rating` field per user per memory
- **Weaviate vector search**: `nearVector` query (already available)
- **Embedding vectors**: Already stored on every Memory object in Weaviate
- **Memory-index-lookup** (`local.memory-index-lookup.md`): For resolving memory UUIDs to collections when building cross-collection centroid

---

## Testing Strategy

- **Unit tests**: Centroid computation (average of N vectors), exclusion filter building, `insufficientData` threshold, result mapping with similarity scores
- **Edge cases**: User with exactly `MIN_PROFILE_SIZE` ratings, user with all ratings in one collection but querying another, empty vector result, all results already rated
- **Mock tests**: Weaviate mock with `nearVector` support, Firestore mock for rating reads
- **Integration tests**: Full flow from rating history → centroid → vector search → ranked results

---

## Resolved Decisions (Clarification 16)

| Decision | Resolution |
|----------|-----------|
| MIN_PROFILE_SIZE | 5 |
| Rating threshold | 4-5 stars only (positive signal) |
| Negative signal | Yes — 1-2 star ratings push centroid away (included in MVP) |
| Centroid scope | Global (all collections) |
| Sort mode enum | Add `byRecommendation` to existing enum |
| Search support | Yes, support query parameter like byDiscovery |
| Insufficient data | Auto-fallback to byDiscovery with `fallback_sort_mode` indicator |
| Similarity exposure | Percentage badge (e.g., "92%") via `similarity_pct` |
| Caching | Firestore cache, invalidate on new 4-5 star ratings only |
| Vector fetch cap | 500 (most recent highly-rated) |
| Min similarity threshold | 0.3 |
| Exclude own memories | Yes |
| SearchFilters support | Yes (content type, date range, etc.) |
| MVP scope | Single centroid + negative signal; multi-centroid clustering deferred |

## Open Questions

- NEGATIVE_WEIGHT value for negative signal subtraction — needs tuning (start with 0.3?)
- What happens when Weaviate embeddings are re-generated (model upgrade)? Cached centroids become invalid. Need invalidation strategy.

---

## Future Enhancements

- **Multi-centroid (taste clusters)**: Cluster the user's highly-rated memories into K groups, compute K centroids, run K vector searches, merge results. Captures diverse tastes better than single centroid. (Tracked in milestone — deferred from MVP)
- **Recency-weighted centroid**: Weight recent ratings more than old ones to capture taste drift over time. Rolling window or exponential decay.
- **Weighted centroid by rating**: Weight 5-star memories more than 4-star in the centroid calculation for finer preference signal.
- **Collaborative boost**: Hybrid approach — if another user with a similar preference centroid rated a memory highly, boost it in recommendations. Lightweight collaborative filtering without full matrix factorization.
- **Explanation**: "Recommended because you rated [Memory X] highly" — trace which preference memories contributed most to the recommendation via vector distance.
- **Feedback loop**: Track whether users rate recommended memories highly. Use this to tune MIN_PROFILE_SIZE, similarity thresholds, and centroid strategy.
- **Centroid drift detection**: Alert or re-weight when a user's recent ratings diverge significantly from their historical centroid (taste has changed).

---

**Status**: Approved
**Clarification**: Clarification 16 completed 2026-03-06. All open questions resolved. Ready for milestone creation and task breakdown.
**Related Documents**:
- `agent/design/local.memory-ratings.md` (dependency)
- `agent/design/local.by-discovery-sort-mode.md` (sibling feature)
- `agent/milestones/milestone-11-basic-sort-modes.md` (Phase 2 reference)
