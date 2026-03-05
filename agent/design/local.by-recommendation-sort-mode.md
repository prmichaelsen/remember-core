# byRecommendation Sort Mode

**Concept**: Personalized sort mode that uses a user's rating history to surface similar content via vector search, regardless of engagement — inspired by SoundCloud Boost
**Created**: 2026-03-05
**Status**: Proposal

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

1. **Build preference profile**: Aggregate embeddings of memories the user rated highly (4-5 stars)
2. **Vector search**: Use the preference profile as a query vector to find similar memories
3. **Filter out known**: Exclude memories the user has already rated
4. **Return results**: Ranked by vector similarity to the user's taste

### Architecture

```
User's rating history (Firestore)
  │
  ▼
Fetch highly-rated memories (4-5 stars)
  │
  ▼
Extract embedding vectors (Weaviate)
  │
  ▼
Compute preference centroid (average of vectors)
  │
  ▼
Vector search: nearVector(centroid)
  │  ├── Exclude: memories user already rated
  │  └── Optional: filter by collection, content type, etc.
  │
  ▼
Ranked results (by cosine similarity to centroid)
```

### Preference Centroid

The simplest approach: average the embedding vectors of all memories the user rated 4 or 5 stars.

```typescript
// Pseudocode
const highlyRated = await getUserRatings(userId, { minRating: 4 });
const embeddings = await getEmbeddings(highlyRated.map(r => r.memoryId));
const centroid = averageVectors(embeddings);
```

This produces a single vector that represents the "center" of the user's preferences in embedding space. Memories near this centroid are semantically similar to things the user already likes.

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
  /** Minimum rating to include in preference profile. Default: 4 */
  minPreferenceRating?: number;
  /** Maximum results. Default: 20 */
  limit?: number;
  /** Standard filters (content type, date range, etc.) */
  filters?: SearchFilters;
}

interface RecommendationModeResult {
  memories: RecommendedMemory[];
  /** Number of highly-rated memories used to build preference profile */
  profileSize: number;
  /** True if user has too few ratings for meaningful recommendations */
  insufficientData: boolean;
}

interface RecommendedMemory extends Memory {
  /** Cosine similarity to user's preference centroid (0.0 - 1.0) */
  similarity: number;
}
```

### Query Flow

```typescript
async byRecommendation(input: RecommendationModeRequest): Promise<RecommendationModeResult> {
  // 1. Get user's highly-rated memory IDs from Firestore
  const ratings = await this.getUserHighRatings(input.userId, input.minPreferenceRating ?? 4);

  if (ratings.length < MIN_PROFILE_SIZE) {
    return { memories: [], profileSize: ratings.length, insufficientData: true };
  }

  // 2. Fetch embedding vectors from Weaviate
  const embeddings = await this.getEmbeddingVectors(ratings.map(r => r.memoryId), input.collectionName);

  // 3. Compute preference centroid
  const centroid = this.averageVectors(embeddings);

  // 4. Vector search excluding already-rated memories
  const ratedIds = await this.getAllUserRatedIds(input.userId);
  const results = await collection.query.nearVector(centroid, {
    limit: input.limit ?? 20,
    filters: this.buildExclusionFilter(ratedIds, input.filters),
    returnMetadata: ['distance'],
  });

  // 5. Map results
  return {
    memories: results.map(r => ({ ...r, similarity: 1 - r.metadata.distance })),
    profileSize: ratings.length,
    insufficientData: false,
  };
}
```

### Minimum Profile Size

Recommendations are meaningless with too few data points. If a user has rated fewer than N memories highly, return `insufficientData: true` and an empty result set. The consumer (agentbase.me) can fall back to `byRating` or `byDiscovery`.

### Cross-Collection Considerations

A user's highly-rated memories may span multiple Weaviate collections (their own, groups, spaces). The preference centroid should be built from all highly-rated memories regardless of collection. However, the vector search query targets a specific collection. This means:
- Centroid = built from embeddings across all collections the user has rated in
- Search = scoped to the requested collection
- Embedding vectors must be fetched per-collection (Weaviate has no cross-collection vector retrieval)

### Caching the Preference Centroid

Computing the centroid requires reading all high-rated memory IDs from Firestore + fetching their vectors from Weaviate. This is expensive per request.

Options:
- **Compute per-request**: Simplest. Expensive but accurate. Acceptable if rating history is small (< 100 memories).
- **Cache in Firestore**: Store the centroid vector as a Firestore doc. Invalidate when the user submits a new 4-5 star rating. Cheap reads, slightly stale.
- **Background job**: Recompute centroids periodically via job system. Most scalable but adds latency to preference updates.

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

## Open Questions

- What is the right `MIN_PROFILE_SIZE`? 3? 5? 10? Fewer = earlier activation but noisier centroid. More = better centroid but longer cold-start.
- Should the centroid include 3-star ratings (neutral) as negative signal, or only use 4-5 stars as positive signal?
- Should the centroid be collection-specific (only ratings in the target collection) or global (all collections)? Global is richer but requires cross-collection vector fetching.
- How to handle the centroid for a user whose tastes have changed significantly over time? Recency-weighted centroid? Rolling window of last N ratings?
- Should `byRecommendation` results include a minimum similarity threshold? (Don't recommend if similarity < 0.5, even if it's the best match available)
- What happens when Weaviate embeddings are re-generated (model upgrade)? Cached centroids become invalid. Need invalidation strategy.

---

## Future Considerations

- **Multi-centroid (taste clusters)**: Cluster the user's highly-rated memories into K groups, compute K centroids, run K vector searches, merge results. Captures diverse tastes better than single centroid.
- **Negative signals**: Use 1-2 star ratings as "anti-preferences" — push the centroid away from disliked content. Requires more sophisticated vector arithmetic.
- **Collaborative boost**: Hybrid approach — if another user with a similar preference centroid rated a memory highly, boost it in recommendations. Lightweight collaborative filtering without full matrix factorization.
- **Explanation**: "Recommended because you rated [Memory X] highly" — trace which preference memories contributed most to the recommendation via vector distance.
- **Feedback loop**: Track whether users rate recommended memories highly. Use this to tune MIN_PROFILE_SIZE, similarity thresholds, and centroid strategy.
- **Centroid drift detection**: Alert or re-weight when a user's recent ratings diverge significantly from their historical centroid (taste has changed).

---

**Status**: Proposal
**Recommendation**: Implement after memory ratings MVP (M18) is complete and users have accumulated rating history. Requires a clarification round to resolve open questions before task breakdown.
**Related Documents**:
- `agent/design/local.memory-ratings.md` (dependency)
- `agent/design/local.by-discovery-sort-mode.md` (sibling feature)
- `agent/milestones/milestone-11-basic-sort-modes.md` (Phase 2 reference)
