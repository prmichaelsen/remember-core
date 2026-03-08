# Task 189: OpenAPI Spec + SVC Client

**Objective**: Add by-my-ratings endpoint to OpenAPI spec and SVC client
**Estimated Hours**: 2
**Dependencies**: [Task 186](task-186-my-ratings-types-browse-mode.md)
**Design Reference**: [byMyRatings Sort Mode](../../design/local.by-my-ratings-sort-mode.md)

---

## Steps

### 1. Update OpenAPI spec (`docs/openapi.yaml`)

Add endpoint:
```yaml
/api/svc/v1/memories/by-my-ratings:
  post:
    summary: Browse and search memories the user has rated
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              spaces: { type: array, items: { type: string } }
              groups: { type: array, items: { type: string } }
              rating_filter:
                type: object
                properties:
                  min: { type: integer, minimum: 1, maximum: 5 }
                  max: { type: integer, minimum: 1, maximum: 5 }
              sort_by: { type: string, enum: [rating, rated_at] }
              direction: { type: string, enum: [asc, desc] }
              query: { type: string }
              limit: { type: integer }
              offset: { type: integer }
    responses:
      200:
        description: Paginated list of rated memories with metadata
```

### 2. Regenerate types

Run `npm run generate:types:svc` to update `src/clients/svc/v1/types.generated.ts`.

### 3. Add SVC client method

In `src/clients/svc/v1/memories.ts`, add to the interface and implementation:
```typescript
byMyRatings(userId: string, input: Record<string, unknown>): Promise<SdkResponse<unknown>>;
```

Implementation:
```typescript
byMyRatings(userId, input) {
  return http.request('POST', '/api/svc/v1/memories/by-my-ratings', { userId, body: input });
},
```

### 4. Update barrel exports

Ensure new types are exported from `src/clients/svc/v1/index.ts`.

---

## Verification

- [ ] OpenAPI spec validates
- [ ] Types regenerated successfully
- [ ] `client.memories.byMyRatings(userId, input)` calls correct endpoint
- [ ] SVC client test covers byMyRatings
