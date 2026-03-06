# Task 115: Wire ModerationClient in remember-rest-service

**Objective**: Pass ModerationClient to SpaceService in remember-rest-service so content moderation activates on publish/revise
**Milestone**: Unassigned (remember-rest-service, not remember-core)
**Status**: Not Started
**Estimated Hours**: 0.5-1

---

## Context

remember-core v0.32.0 added content moderation to SpaceService via an optional `moderationClient` constructor parameter. Moderation is silently skipped if no client is provided. remember-rest-service needs to create and pass a `ModerationClient` when constructing `SpaceService` so that publish/revise requests are moderated.

The `ANTHROPIC_API_KEY` env var is already available in remember-rest-service (used by REM/Haiku).

Design: [local.content-moderation.md](../../design/local.content-moderation.md)

---

## Steps

### 1. Upgrade remember-core dependency

```bash
npm install @prmichaelsen/remember-core@^0.32.0
```

### 2. Create ModerationClient at service initialization

Wherever SpaceService is constructed, add:

```typescript
import { createModerationClient } from '@prmichaelsen/remember-core';

const moderationClient = process.env.ANTHROPIC_API_KEY
  ? createModerationClient({ apiKey: process.env.ANTHROPIC_API_KEY })
  : undefined;
```

### 3. Pass to SpaceService constructor

Add the options bag as the 6th argument:

```typescript
const spaceService = new SpaceService(
  weaviateClient,
  userCollection,
  userId,
  confirmationTokenService,
  logger,
  { moderationClient },  // NEW
);
```

Also check if `createWebSDKContext` or any other factory creates SpaceService — wire it there too.

### 4. Verify

- Publish with normal content -> succeeds
- Publish with hate speech content -> returns 400 ValidationError with `context.fields.moderation=['blocked']`
- No `ANTHROPIC_API_KEY` set -> moderation disabled, publish works as before

---

## Verification

- [ ] remember-core upgraded to >= 0.32.0
- [ ] ModerationClient created when ANTHROPIC_API_KEY is available
- [ ] SpaceService receives moderationClient in all construction paths
- [ ] Publish with blocked content returns ValidationError
- [ ] No regression when ANTHROPIC_API_KEY is absent

---

## Dependencies

- remember-core v0.32.0 published to npm
