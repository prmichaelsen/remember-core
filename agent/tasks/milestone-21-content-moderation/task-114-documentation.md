# Task 114: Documentation

**Objective**: Update CHANGELOG, OpenAPI specs, and README for content moderation feature
**Milestone**: M21 — Content Moderation
**Status**: Not Started
**Estimated Hours**: 1-2

---

## Steps

### 1. CHANGELOG.md

Add entry under next version:

```markdown
### Added
- Content moderation gate for space publish/revise operations
- ModerationService using Claude Haiku for automated content classification
- In-memory content hash cache for moderation results
- Moderation categories: hate_speech, extremism, violence_incitement, csam, self_harm_encouragement
```

### 2. OpenAPI specs

Update `docs/openapi.yaml` and `docs/openapi-web.yaml`:
- Add moderation error example to publish/revise 400 responses
- Document `context.moderation` and `context.category` fields in error schema

### 3. README.md

Add brief mention of content moderation under spaces/publishing section if applicable.

### 4. Version bump

Determine version bump (likely minor — new feature, backward compatible).

---

## Verification

- [ ] CHANGELOG updated with moderation feature
- [ ] OpenAPI specs document moderation errors
- [ ] Version bumped appropriately

---

## Dependencies

- task-113 (tests passing before documenting)
