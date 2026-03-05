# Content Moderation Service

**Concept**: LLM-based content moderation gate for space publish/revise operations
**Created**: 2026-03-05
**Status**: Design Specification

---

## Overview

Automated content moderation for memories published to shared spaces (the_void, profiles, ghosts). Uses Claude Haiku as a fast, cheap classification gate that runs synchronously on publish and revise, returning a pass/fail verdict with a human-readable reason. Intentionally lenient — blocks only extreme hate, violence incitement, CSAM, and self-harm encouragement while allowing edgy, controversial, or uncomfortable content.

**Source**: clarification-11-content-moderation, clarification-12-content-moderation-examples

---

## Problem Statement

- Shared spaces are publicly visible. Without moderation, users can publish explicit hate speech, Nazi propaganda, genocide celebration, direct threats, or CSAM.
- Manual moderation (existing `SpaceService.moderate()`) requires human moderators and is reactive — content is visible before review.
- Need a proactive, automated gate that blocks the worst content before it reaches spaces.

---

## Solution

A new `ModerationService` that calls Haiku to classify memory content as pass/fail before publish/revise completes. Follows the existing `rem.haiku.ts` pattern (direct HTTP to Anthropic API). Integrates into `SpaceService` publish and revise flows as a blocking pre-check.

**Key design decisions:**
- **Haiku, not Sonnet** — conservatism is a feature for moderation (unlike REM where it was a bug). Cheaper and faster.
- **Synchronous/blocking** — moderation must complete before publish/revise succeeds.
- **Fail-closed** — if Haiku API fails, content is blocked (not allowed through).
- **Content field only** — titles are LLM-generated and don't need moderation.
- **Spaces only** — private memories are not moderated.
- **In-memory cache** — hash content to avoid re-checking identical text.

---

## Implementation

### ModerationService

```typescript
// src/services/moderation.service.ts

export type ModerationCategory =
  | 'hate_speech'
  | 'extremism'
  | 'violence_incitement'
  | 'csam'
  | 'self_harm_encouragement';

export interface ModerationResult {
  pass: boolean;
  reason: string;           // human-friendly, shown verbatim to user
  category?: ModerationCategory;  // only on rejection
}

export interface ModerationClient {
  moderate(content: string): Promise<ModerationResult>;
}

export function createModerationClient(options: {
  apiKey: string;
  model?: string;
}): ModerationClient;

export function createMockModerationClient(
  defaultResult?: ModerationResult,
): ModerationClient;
```

### LLM Prompt

The prompt instructs Haiku to act as a content moderation classifier with these categories and examples:

```
You are a content moderation classifier. Evaluate the following user-generated
content and determine if it should be ALLOWED or BLOCKED from a public space.

You must be LENIENT. Most content should pass. Only block content that is
clearly and explicitly in one of these categories:

BLOCK categories:
1. HATE SPEECH — Explicit dehumanization of ethnic/racial/religious groups,
   calls for violence against protected groups, racial slurs used to demean.
   Examples that FAIL:
   - "All [ethnic group] should be exterminated"
   - Explicit Nazi ideology or white supremacist recruitment
   - Genocide celebration

2. VIOLENCE INCITEMENT — Direct threats against specific people or locations,
   incitement to commit specific acts of mass violence.
   Examples that FAIL:
   - "I'm going to find [person] and make them pay"
   - "Someone should shoot up [location]"
   Examples that PASS:
   - Instructions or information about weapons (legally protected speech)
   - Historical/philosophical discussion of violence
   - Fictional violence (games, stories)
   - Colloquial expressions ("I could kill for a burger")

3. CSAM — Any sexual content involving minors. Zero tolerance.

4. SELF-HARM ENCOURAGEMENT — Detailed instructions or active encouragement
   for self-harm or suicide.
   Examples that PASS:
   - Discussions about depression, mental health struggles
   - Jokes about suicide or dark humor about self-harm
   - Journaling about difficult feelings

ALWAYS ALLOW:
- Harsh political opinions, criticism of governments or public figures
- Edgy humor, dark comedy, offensive jokes (without targeted hate)
- Strong opinions about religion, ideology, or social issues
- Profanity and vulgar language
- Controversial or uncomfortable topics
- Educational/historical content about atrocities

Content to evaluate:
---
{content}
---

Respond with ONLY valid JSON:
{"pass": true}
OR
{"pass": false, "reason": "<specific, human-friendly explanation>", "category": "<hate_speech|extremism|violence_incitement|csam|self_harm_encouragement>"}
```

### Caching

```typescript
// In-memory LRU cache keyed by content hash
import { createHash } from 'crypto';

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

// Simple Map with size limit (e.g., 1000 entries)
const cache = new Map<string, ModerationResult>();
```

### Integration Point

Moderation hooks into `SpaceService` publish and revise flows. Both operations already fetch the source memory's content before copying to space collections — moderation checks that content before proceeding.

```typescript
// In SpaceService constructor, accept optional ModerationClient
constructor(deps: {
  // ... existing deps
  moderationClient?: ModerationClient;
})

// In publish flow (after fetching memory, before writing to space):
if (this.moderationClient) {
  const result = await this.moderationClient.moderate(memory.content);
  if (!result.pass) {
    throw new ValidationError(result.reason, {
      category: result.category,
      moderation: 'blocked',
    });
  }
}

// Same check in revise flow (after fetching updated content)
```

### Error Shape

Moderation rejection surfaces as a `ValidationError` (existing error class), returned to clients as:

```json
{
  "error": {
    "kind": "validation",
    "message": "Content blocked: contains explicit dehumanization targeting an ethnic group",
    "context": {
      "category": "hate_speech",
      "moderation": "blocked"
    }
  }
}
```

Clients can check `context.moderation === 'blocked'` to distinguish moderation rejections from other validation errors.

### API Call Pattern

Follows `rem.haiku.ts` exactly:

```typescript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': options.apiKey,
    'anthropic-version': '2023-06-01',
  },
  body: JSON.stringify({
    model: options.model ?? 'claude-haiku-4-5-20251001',
    max_tokens: 256,  // moderation responses are short
    messages: [{ role: 'user', content: prompt }],
  }),
});
```

Note: `max_tokens: 256` (vs 512 for REM) since moderation responses are short JSON.

---

## Benefits

- **Proactive** — blocks content before it reaches spaces (vs reactive manual moderation)
- **Fast** — Haiku is the fastest/cheapest Claude model; 256 max tokens keeps latency low
- **Lenient by design** — only catches extreme content, avoids false positives on edgy content
- **Cacheable** — identical content returns cached result instantly
- **Consistent pattern** — follows existing `rem.haiku.ts` architecture, no new dependencies

---

## Trade-offs

- **Latency** — adds one LLM call to every publish/revise (~200-500ms). Mitigated by caching.
- **Fail-closed** — Anthropic API outage blocks all publishing. Acceptable for safety but worth monitoring.
- **False positives** — LLM moderation is imperfect. Lenient prompt reduces this but can't eliminate it. No appeal mechanism in v1.
- **Cost** — Haiku call per unique publish/revise. Low per-call cost but scales with volume.
- **No doxxing/spam detection** — deferred to future versions to keep v1 scope tight.

---

## Dependencies

- `ANTHROPIC_API_KEY` — already used by `rem.haiku.ts`, no new secrets needed
- `claude-haiku-4-5-20251001` — Haiku model for classification
- Existing `ValidationError` from `src/errors/app-errors.ts`
- Existing `SpaceService` publish/revise flows

---

## Testing Strategy

- **Unit tests** for `ModerationService` using mock HTTP responses (colocated `moderation.service.spec.ts`)
- **Unit tests** for cache behavior (hit, miss, eviction)
- **Unit tests** for `SpaceService` integration (mock `ModerationClient` injected)
- **Mock client** (`createMockModerationClient`) for all other tests that touch publish/revise
- No live Haiku tests in CI — prompt quality validated manually

---

## Migration Path

1. Create `src/services/moderation.service.ts` with `ModerationClient` interface and `createModerationClient`
2. Add optional `moderationClient` to `SpaceService` constructor
3. Add moderation check to publish flow
4. Add moderation check to revise flow
5. Wire up in service initialization (pass `moderationClient` when creating `SpaceService`)
6. Update `src/web/spaces.ts` and `src/app/spaces.ts` to surface moderation errors

No schema changes. No data migration. Fully backwards-compatible (moderation is optional via constructor injection).

---

## Future Considerations

- **Appeal mechanism** — allow users to contest moderation decisions
- **Doxxing detection** — detect and block PII dumps with malicious intent
- **Spam detection** — block scam/spam content (may be better as separate service)
- **Dedicated moderation API** — replace/supplement LLM with Perspective API or similar
- **Moderation logging** — audit trail for improving prompt over time
- **Configurable thresholds** — per-space moderation sensitivity

---

**Status**: Design Specification
**Recommendation**: Implement — create tasks for ModerationService, SpaceService integration, and tests
**Related Documents**: clarification-11-content-moderation, clarification-12-content-moderation-examples, agent/design/ghost-persona-system.md (spaces architecture)
