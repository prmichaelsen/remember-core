# Task 187: Search Mode (Hybrid Intersection)

**Objective**: Add search query support to byMyRatings — hybrid search on Weaviate collections intersected with rated ID set
**Estimated Hours**: 3
**Dependencies**: [Task 186](task-186-my-ratings-types-browse-mode.md)
**Design Reference**: [byMyRatings Sort Mode](../../design/local.by-my-ratings-sort-mode.md)

---

## Steps

### 1. Implement search mode in `byMyRatings`

When `input.query` is provided:

1. **Fetch all rating docs** from `getUserRatingsPath(userId)` (no cursor pagination — need full ID set for intersection)
2. **Filter by scope and star**: Same filters as browse mode
3. **Collect rated memory IDs grouped by collectionName**: `Map<string, Set<string>>`
4. **Run hybrid search per collection**: For each collectionName with rated IDs:
   - Get Weaviate collection
   - Run hybrid search with `input.query`, `alpha: 0.7`, reasonable limit (e.g., 200)
   - Intersect search results with rated IDs for that collection
5. **Merge intersected results** across collections (Weaviate relevance ordering preserved)
6. **Apply offset/limit** to merged results
7. **Attach metadata**: Look up `my_rating` and `rated_at` from rating docs for each result
8. **Build response** using `{ memory, metadata }` envelope

### 2. Wire query detection in byMyRatings

Update the `byMyRatings` method to branch:
- If `input.query?.trim()` → search mode (this task)
- Otherwise → browse mode (task 186)

---

## Verification

- [ ] Search with query returns only memories that are both rated AND match the query
- [ ] Relevance ranking from Weaviate is preserved
- [ ] Results correctly intersected across multiple collections
- [ ] Metadata (my_rating, rated_at) attached to search results
- [ ] Pagination (offset/limit) applies to final intersected result
- [ ] Empty query falls through to browse mode
