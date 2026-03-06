# Task 136: Add CommentsResource to App Client

## Objective

Create `src/app/comments.ts` with a `CommentsResource` that wraps `POST /api/app/v1/spaces/comments` and wire it into the `createAppClient` factory.

## Context

The OpenAPI spec defines `appCreateAndPublishComment` at `POST /api/app/v1/spaces/comments`. The types are already generated in `src/app/types.generated.ts` (`CreateCommentInput`, `CreateCommentResult`). The app client factory in `src/app/index.ts` needs a new `comments` property.

agentbase.me currently orchestrates comment creation with two svc SDK calls (`svc.memories.create` + `svc.spaces.publish`). This resource will let it use `appClient.comments.createAndPublish()` instead.

## Steps

1. Create `src/app/comments.ts`:
   - Define `CommentsResource` interface with `createAndPublish(userId, input)` method
   - Input: `{ content, parent_id, thread_root_id?, spaces?, groups?, tags? }`
   - Returns: `Promise<SdkResponse<{ memory_id, created_at, published_to }>>`
   - Implementation: `http.request('POST', '/api/app/v1/spaces/comments', { userId, body: input })`

2. Wire into `src/app/index.ts`:
   - Import `createCommentsResource` and `CommentsResource`
   - Add `comments: CommentsResource` to `AppClient` interface
   - Add `comments: createCommentsResource(http)` to factory
   - Re-export `CommentsResource` type

3. Create `src/app/comments.spec.ts`:
   - Test that `createAndPublish` calls correct endpoint with correct method/body
   - Test userId is passed through
   - Test optional fields (thread_root_id, spaces, groups, tags)

4. Verify build compiles and all tests pass

## Verification

- [ ] `src/app/comments.ts` created with `CommentsResource` interface and factory
- [ ] `createAppClient` returns `comments` property
- [ ] `comments.createAndPublish()` sends POST to `/api/app/v1/spaces/comments`
- [ ] Colocated tests pass
- [ ] Build compiles, exports work
- [ ] Type re-exports in barrel

## Dependencies

- M9 task-43 (App Client factory) — completed
- OpenAPI types generated — done

## Estimated Hours

1-2
