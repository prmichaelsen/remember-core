# Task 176: Space Sort Mode Types + byTime + byRating

**Milestone**: M35 — SpaceService Sort Modes
**Status**: Not Started
**Estimated Hours**: 3

---

## Objective

Define input/result type interfaces for all 5 space sort modes. Implement `SpaceService.byTime()` and `SpaceService.byRating()` methods following the cross-collection pattern from `byDiscovery`.

---

## Context

- MemoryService byTime: `src/services/memory.service.ts:655-713`
- MemoryService byRating: `src/services/memory.service.ts:786-850` (approx)
- SpaceService byDiscovery pattern: `src/services/space.service.ts:1183-1342`
- `buildBaseFilters()`: `src/services/space.service.ts:1524-1571`

---

## Steps

### 1. Define shared base type for space sort mode inputs

```typescript
// Common fields for all space sort mode inputs
interface SpaceSortBaseInput {
  spaces?: string[];
  groups?: string[];
  content_type?: string;
  tags?: string[];
  min_weight?: number;
  max_weight?: number;
  date_from?: string;
  date_to?: string;
  moderation_filter?: ModerationFilter;
  include_comments?: boolean;
  limit?: number;
  offset?: number;
  dedupe?: DedupeOptions;
}
```

### 2. Define input/result types for all 5 modes

In `space.service.ts`, add interfaces:

```typescript
// byTime
export interface TimeSpaceInput extends SpaceSortBaseInput {
  direction?: 'asc' | 'desc';
}
export interface TimeSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

// byRating
export interface RatingSpaceInput extends SpaceSortBaseInput {
  direction?: 'asc' | 'desc';
}
export interface RatingSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
}

// byProperty
export interface PropertySpaceInput extends SpaceSortBaseInput {
  sort_field: string;
  sort_direction: 'asc' | 'desc';
}
export interface PropertySpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: Record<string, unknown>[];
  total: number;
  offset: number;
  limit: number;
  sort_field: string;
  sort_direction: 'asc' | 'desc';
}

// byBroad
export interface BroadSpaceInput extends SpaceSortBaseInput {
  query?: string;
  sort_order?: 'asc' | 'desc';
}
export interface BroadSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  results: BroadSearchResult[];
  total: number;
  offset: number;
  limit: number;
}

// byRandom
export interface RandomSpaceInput extends SpaceSortBaseInput {
  // limit only, no offset (random has no pagination)
}
export interface RandomSpaceResult {
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  results: Record<string, unknown>[];
  total_pool_size: number;
}
```

### 3. Extract shared validation + collection-setup helper

The byDiscovery and byRecommendation methods both have identical space/group validation and moderation permission checks (~30 lines). Extract into a private helper:

```typescript
private validateSpaceGroupInput(
  spaces: string[],
  groups: string[],
  moderationFilter: ModerationFilter,
  authContext?: AuthContext,
): void {
  // Validate space IDs
  if (spaces.length > 0) {
    const invalid = spaces.filter((s) => !isValidSpaceId(s));
    if (invalid.length > 0) throw new ValidationError(`Invalid space IDs: ${invalid.join(', ')}`, { spaces: invalid });
  }
  // Validate group IDs
  if (groups.length > 0) {
    const invalid = groups.filter((g) => !g || g.includes('.') || g.trim() === '');
    if (invalid.length > 0) throw new ValidationError('Group IDs cannot be empty or contain dots');
  }
  // Permission check
  if (moderationFilter !== 'approved') {
    for (const groupId of groups) {
      if (!canModerate(authContext, groupId))
        throw new ForbiddenError(`Moderator access required to view ${moderationFilter} memories in group ${groupId}`);
    }
    if ((spaces.length > 0 || groups.length === 0) && !canModerateAny(authContext))
      throw new ForbiddenError(`Moderator access required to view ${moderationFilter} memories in spaces`);
  }
}
```

### 4. Extract shared cross-collection search helper

```typescript
private async searchAcrossCollections(
  input: SpaceSortBaseInput,
  fetchFromCollection: (collection: any, baseFilters: any[]) => Promise<any[]>,
): Promise<{ allResults: any[]; spacesSearched: string[] | 'all_public'; groupsSearched: string[] }> {
  const spaces = input.spaces || [];
  const groups = input.groups || [];
  const allResults: any[] = [];

  // Spaces collection
  if (spaces.length > 0 || groups.length === 0) {
    await ensurePublicCollection(this.weaviateClient);
    const name = getCollectionName(CollectionType.SPACES);
    const collection = this.weaviateClient.collections.get(name);
    const baseFilters = this.buildBaseFilters(collection, input as any);
    if (spaces.length > 0) baseFilters.push(collection.filter.byProperty('space_ids').containsAny(spaces));
    allResults.push(...tagWithSource(await fetchFromCollection(collection, baseFilters), name));
  }

  // Group collections
  for (const groupId of groups) {
    const name = getCollectionName(CollectionType.GROUPS, groupId);
    const exists = await this.weaviateClient.collections.exists(name);
    if (!exists) continue;
    const collection = this.weaviateClient.collections.get(name);
    const baseFilters = this.buildBaseFilters(collection, input as any);
    allResults.push(...tagWithSource(await fetchFromCollection(collection, baseFilters), name));
  }

  return {
    allResults,
    spacesSearched: spaces.length > 0 ? spaces : (groups.length === 0 ? 'all_public' : []),
    groupsSearched: groups,
  };
}
```

### 5. Implement byTime

```typescript
async byTime(input: TimeSpaceInput, authContext?: AuthContext): Promise<TimeSpaceResult> {
  const spaces = input.spaces || [];
  const groups = input.groups || [];
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  const direction = input.direction ?? 'desc';
  const moderationFilter = input.moderation_filter || 'approved';

  this.validateSpaceGroupInput(spaces, groups, moderationFilter, authContext);

  const fetchLimit = (limit + offset) * 2;

  const { allResults, spacesSearched, groupsSearched } = await this.searchAcrossCollections(input, async (collection, baseFilters) => {
    const combined = baseFilters.length > 0 ? Filters.and(...baseFilters) : undefined;
    const opts: any = {
      limit: fetchLimit,
      sort: collection.sort.byProperty('created_at', direction === 'asc'),
    };
    if (combined) opts.filters = combined;
    return (await collection.query.fetchObjects(opts)).objects;
  });

  const deduped = dedupeBySourceId(allResults, input.dedupe);
  // Sort merged results by created_at
  deduped.sort((a: any, b: any) => {
    const aTime = new Date(a.properties?.created_at || 0).getTime();
    const bTime = new Date(b.properties?.created_at || 0).getTime();
    return direction === 'desc' ? bTime - aTime : aTime - bTime;
  });

  const paginated = deduped.slice(offset, offset + limit);
  const memories = paginated
    .filter((obj: any) => obj.properties?.doc_type === 'memory')
    .map((obj: any) => ({ id: obj.uuid, ...obj.properties }));

  return { spaces_searched: spacesSearched, groups_searched: groupsSearched, memories, total: memories.length, offset, limit };
}
```

### 6. Implement byRating

Same pattern as byTime but sort by `rating_bayesian` property.

---

## Verification

- [ ] All 5 input/result type interfaces defined
- [ ] `SpaceSortBaseInput` base type extracts common fields
- [ ] `validateSpaceGroupInput()` helper extracted
- [ ] `searchAcrossCollections()` helper extracted
- [ ] `byTime()` sorts by `created_at` across space/group collections
- [ ] `byRating()` sorts by `rating_bayesian` across space/group collections
- [ ] Both methods validate spaces/groups, check moderation permissions, dedupe
- [ ] Existing byDiscovery/byRecommendation still work (refactor to use helpers is optional, not required)
