# Milestone 26: App Client Comments Resource

## Goal

Add a `CommentsResource` to the app client SDK so consumers (agentbase.me) can create and publish comments via a single compound call instead of orchestrating `svc.memories.create` + `svc.spaces.publish` manually.

## Context

- OpenAPI spec already defines `POST /api/app/v1/spaces/comments` (`appCreateAndPublishComment`)
- Generated types exist: `CreateCommentInput`, `CreateCommentResult`
- Server-side route handler does NOT exist yet in remember-core (needs implementation in remember-rest-server or remember-core web layer)
- App client (`src/app/`) has no `comments.ts` resource

## Deliverables

1. `src/app/comments.ts` — `CommentsResource` with `createAndPublish()` method
2. Wire `CommentsResource` into `createAppClient` factory
3. Colocated tests (`src/app/comments.spec.ts`)
4. Update barrel exports and type re-exports

## Success Criteria

- `appClient.comments.createAndPublish(userId, input)` calls `POST /api/app/v1/spaces/comments`
- Input accepts `content`, `parent_id`, `thread_root_id`, `spaces`, `groups`, `tags`
- Returns `SdkResponse<CreateCommentResult>` with `memory_id`, `created_at`, `published_to`
- Tests pass, build compiles, exports work

## Estimated Duration

0.5 weeks (1-2 tasks, ~2-4 hours)

## Dependencies

- M9 (Client SDKs) — completed
- OpenAPI spec + generated types — done
