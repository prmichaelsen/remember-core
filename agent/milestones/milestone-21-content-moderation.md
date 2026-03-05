# Milestone 21: Content Moderation

**Goal**: Automated LLM-based content moderation gate for space publish/revise operations
**Duration**: 1-2 weeks
**Dependencies**: None (uses existing SpaceService, Anthropic API key)
**Status**: Not Started

---

## Overview

Add a ModerationService that uses Claude Haiku to classify memory content as pass/fail before publish/revise to shared spaces. Blocks extreme hate speech, violence incitement, CSAM, and self-harm encouragement while allowing edgy, controversial, or uncomfortable content. Follows the existing `rem.haiku.ts` pattern.

Design doc: [local.content-moderation.md](../design/local.content-moderation.md)
Clarifications: 11 (scope/policy), 12 (pass/fail examples)

---

## Deliverables

### 1. ModerationService
- `src/services/moderation.service.ts` — ModerationClient interface, createModerationClient, createMockModerationClient
- LLM prompt with concrete pass/fail examples
- In-memory SHA-256 content hash cache

### 2. SpaceService Integration
- Moderation check in publish flow (blocking, pre-insert)
- Moderation check in revise flow (blocking, pre-update)
- Optional ModerationClient via constructor injection

### 3. Web/App Layer
- Moderation errors surfaced as ValidationError with `context.moderation` and `context.category`
- No new endpoints — errors propagate through existing publish/revise responses

### 4. Tests
- ModerationService unit tests (mock HTTP)
- SpaceService integration tests (mock ModerationClient)
- Cache behavior tests

### 5. Documentation
- CHANGELOG entry
- OpenAPI spec error examples updated

---

## Success Criteria

- [ ] ModerationService passes content through Haiku and returns pass/fail with reason
- [ ] Publish to spaces blocked when content fails moderation
- [ ] Revise in spaces blocked when content fails moderation
- [ ] Fail-closed: API errors block content (not allow through)
- [ ] Cache returns instant results for identical content
- [ ] All existing tests still pass (mock ModerationClient injected)
- [ ] New unit tests pass

---

## Key Files to Create

```
src/services/
├── moderation.service.ts        # ModerationClient + createModerationClient
└── moderation.service.spec.ts   # Unit tests (colocated)
```

## Key Files to Modify

```
src/services/
├── space.service.ts             # Add moderationClient, checks in publish/revise
└── space.service.spec.ts        # Update with mock moderation
src/web/
└── spaces.ts                    # Error propagation (if needed)
src/app/
└── spaces.ts                    # Error propagation (if needed)
```

---

## Tasks

1. [Task 111: ModerationService](../tasks/milestone-21-content-moderation/task-111-moderation-service.md) — Core service with Haiku client, prompt, cache
2. [Task 112: SpaceService Integration](../tasks/milestone-21-content-moderation/task-112-space-service-integration.md) — Wire moderation into publish/revise flows
3. [Task 113: Unit Tests](../tasks/milestone-21-content-moderation/task-113-unit-tests.md) — ModerationService + SpaceService moderation tests
4. [Task 114: Documentation](../tasks/milestone-21-content-moderation/task-114-documentation.md) — CHANGELOG, OpenAPI, README updates

---

## Environment Variables

```env
# Already exists — used by rem.haiku.ts
ANTHROPIC_API_KEY=your_api_key_here
```

No new environment variables required.

---

## Testing Requirements

- [ ] ModerationService unit tests with mock HTTP responses
- [ ] Cache hit/miss/eviction tests
- [ ] SpaceService publish moderation (pass, fail, API error)
- [ ] SpaceService revise moderation (pass, fail, API error)
- [ ] Mock ModerationClient used in all other space tests

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Haiku false positives on edge cases | Medium | Low | Lenient prompt with concrete examples; no appeal in v1 |
| Anthropic API outage blocks all publishing | High | Low | Fail-closed is intentional per requirements; monitor |
| Latency impact on publish/revise | Low | Medium | Cache reduces repeat checks; Haiku is fast (~200ms) |

---

**Next Milestone**: TBD
**Blockers**: None
**Notes**: Doxxing, spam detection, and appeal mechanism deferred to future milestones
