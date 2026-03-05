# Task 112: SpaceService Integration

**Objective**: Wire ModerationClient into SpaceService publish and revise flows as a blocking pre-check
**Milestone**: M21 — Content Moderation
**Status**: Not Started
**Estimated Hours**: 2-3

---

## Context

SpaceService already handles publish, revise, and moderation. The ModerationClient hooks in as an optional constructor dependency. When present, it runs before content is written to space collections.

Design: [local.content-moderation.md](../../design/local.content-moderation.md)

---

## Steps

### 1. Add ModerationClient to SpaceService constructor

Add optional `moderationClient?: ModerationClient` to the SpaceService constructor deps interface. No breaking change — it's optional.

### 2. Add moderation check to publish flow

In the publish method, after fetching the source memory's content but before creating the confirmation token / writing to space:

```typescript
if (this.moderationClient) {
  const result = await this.moderationClient.moderate(memory.content);
  if (!result.pass) {
    throw new ValidationError(result.reason, {
      category: result.category,
      moderation: 'blocked',
    });
  }
}
```

### 3. Add moderation check to revise flow

Same check in the revise method, after fetching updated content from the user's collection.

### 4. Verify error propagation

Ensure `ValidationError` from moderation flows through:
- `src/web/spaces.ts` — caught by try/catch, returned as `err(wrapError(e))`
- `src/app/spaces.ts` — same pattern

The existing error handling should surface it correctly as:
```json
{
  "error": {
    "kind": "validation",
    "message": "Content blocked: ...",
    "context": { "category": "hate_speech", "moderation": "blocked" }
  }
}
```

No changes needed in web/app layers if `ValidationError` context is preserved.

### 5. Wire up in service initialization

Wherever SpaceService is constructed (check service factory / initialization code), pass `moderationClient` when available (i.e., when `ANTHROPIC_API_KEY` is set).

---

## Verification

- [ ] SpaceService accepts optional `moderationClient` in constructor
- [ ] Publish checks moderation before proceeding
- [ ] Revise checks moderation before proceeding
- [ ] Moderation failure throws `ValidationError` with category and moderation context
- [ ] Existing publish/revise behavior unchanged when no moderationClient provided
- [ ] Error response includes `context.moderation = 'blocked'` and `context.category`

---

## Dependencies

- task-111 (ModerationService must exist first)
