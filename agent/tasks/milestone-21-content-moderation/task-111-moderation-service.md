# Task 111: ModerationService

**Objective**: Create the core ModerationService with Haiku LLM client, moderation prompt, and content hash cache
**Milestone**: M21 — Content Moderation
**Status**: Not Started
**Estimated Hours**: 3-4

---

## Context

The ModerationService follows the same pattern as `src/services/rem.haiku.ts` — direct HTTP calls to the Anthropic API, no SDK. It classifies memory content as pass/fail using Claude Haiku, returning a human-friendly reason and category on rejection.

Design: [local.content-moderation.md](../../design/local.content-moderation.md)

---

## Steps

### 1. Create ModerationService types and interface

File: `src/services/moderation.service.ts`

```typescript
export type ModerationCategory =
  | 'hate_speech'
  | 'extremism'
  | 'violence_incitement'
  | 'csam'
  | 'self_harm_encouragement';

export interface ModerationResult {
  pass: boolean;
  reason: string;
  category?: ModerationCategory;
}

export interface ModerationClient {
  moderate(content: string): Promise<ModerationResult>;
}
```

### 2. Build moderation prompt

Create `buildModerationPrompt(content: string): string` with:
- BLOCK categories: hate speech, extremism, violence incitement, CSAM, self-harm encouragement
- ALLOW list: political opinions, dark humor, profanity, controversial topics, educational content
- Concrete examples from clarification-12
- JSON response format: `{"pass": true}` or `{"pass": false, "reason": "...", "category": "..."}`

Key calibration points from clarification-12:
- Weapon instructions are PASS (legally protected speech, no incitement)
- Suicide jokes/discussions are PASS (only block active encouragement)
- Edgy-but-acceptable content is PASS

### 3. Implement createModerationClient

Follow `rem.haiku.ts` pattern:
- Direct `fetch()` to `https://api.anthropic.com/v1/messages`
- Model: `claude-haiku-4-5-20251001` (default, overridable via options)
- Max tokens: 256
- Parse JSON response
- On API error: return `{ pass: false, reason: 'Content moderation unavailable. Please try again later.' }` (fail-closed)

### 4. Add content hash cache

- SHA-256 hash of content string as cache key
- Simple `Map<string, ModerationResult>` with max size (1000 entries)
- LRU eviction: delete oldest entry when at capacity
- Check cache before API call, store result after

### 5. Create mock client

```typescript
export function createMockModerationClient(
  defaultResult?: ModerationResult,
): ModerationClient
```

Default: `{ pass: true, reason: '' }`

### 6. Export from barrel

Add exports to `src/services/index.ts`.

---

## Verification

- [ ] `ModerationClient` interface exported
- [ ] `createModerationClient` creates working client
- [ ] `createMockModerationClient` creates mock for testing
- [ ] Prompt includes all 5 block categories with examples
- [ ] Prompt includes ALLOW list with examples
- [ ] Cache prevents duplicate API calls for same content
- [ ] Fail-closed: API errors return rejection
- [ ] Barrel exports updated

---

## Dependencies

- None (standalone service, no other tasks required first)
