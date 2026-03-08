# Task 186: MyRatings Types + Browse Mode

**Objective**: Add MyRatings types and implement browse mode (no query) on RatingService
**Estimated Hours**: 4
**Dependencies**: [Task 185](task-185-rating-doc-schema-backfill.md)
**Design Reference**: [byMyRatings Sort Mode](../../design/local.by-my-ratings-sort-mode.md)

---

## Steps

### 1. Add types to `rating.types.ts`

```typescript
export interface MyRatingsRequest {
  userId: string;
  spaces?: string[];
  groups?: string[];
  rating_filter?: { min?: number; max?: number };
  sort_by?: 'rating' | 'rated_at';  // default: 'rated_at'
  direction?: 'desc' | 'asc';       // default: 'desc'
  query?: string;
  limit?: number;                     // default: 50
  offset?: number;                    // default: 0
}

export interface MyRatingMetadata {
  my_rating: number;
  rated_at: string;
  deleted?: boolean;
  unavailable?: boolean;
}

export interface MyRatingsResult {
  items: Array<{
    memory: Record<string, unknown>;
    metadata: MyRatingMetadata;
  }>;
  total: number;
  offset: number;
  limit: number;
}
```

Export from `types/index.ts` barrel.

### 2. Implement `byMyRatings` browse mode on RatingService

Add method `async byMyRatings(input: MyRatingsRequest): Promise<MyRatingsResult>`:

1. **Read rating docs**: Use `queryDocuments(getUserRatingsPath(userId), { orderBy, limit, startAfter })` with Firestore cursor pagination
   - `sort_by: 'rated_at'` → `orderBy: [{ field: 'updated_at', direction }]`
   - `sort_by: 'rating'` → `orderBy: [{ field: 'rating', direction }]`
2. **Scope filter**: If `spaces` or `groups` provided, filter rating docs by `collectionName` matching those arrays. If both empty, include all.
3. **Star filter**: If `rating_filter` provided, filter docs where `rating >= min && rating <= max`
4. **Paginate**: Apply offset/limit to filtered results
5. **Hydrate**: Group memory IDs by collectionName, batch-fetch from Weaviate using `fetchMemoryWithAllProperties`
6. **Build response**: Construct `{ memory, metadata }` items

For this task, implement browse mode only (no query). Search mode is task 187.

If `input.query` is provided, skip browse mode and defer to search mode (throw or return empty — task 187 wires this).

---

## Verification

- [ ] `MyRatingsRequest`, `MyRatingsResult`, `MyRatingMetadata` exported from types
- [ ] `byMyRatings` returns paginated rated memories sorted by rating or rated_at
- [ ] Scope filtering works: personal, specific space, specific group, multiple, all
- [ ] Star filtering works: exact, range, no filter
- [ ] Firestore cursor pagination used (not fetch-all)
- [ ] Build passes
