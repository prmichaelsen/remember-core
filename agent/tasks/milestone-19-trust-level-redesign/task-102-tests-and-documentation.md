# Task 102: Tests and Documentation

**Milestone**: M19 — Trust Level Redesign
**Status**: not_started
**Estimated Hours**: 2–3
**Dependencies**: Tasks 98–101

---

## Objective

Update all trust-related tests to use integer 1–5 scale. Update design docs, OpenAPI specs, and migration guide.

## Steps

### 1. Update/create trust-enforcement tests

In `src/services/trust-enforcement.service.spec.ts`:
- Test `formatMemoryForPrompt()` for all 5 integer levels
- Verify trust=5 (Secret) memories require accessor level 5
- Verify no special-case guard for any level
- Test `getTrustLevelLabel()` returns correct labels
- Test `getTrustInstructions()` returns correct instructions
- Test `buildTrustFilter()` with integer values

### 2. Update/create access-control tests

In `src/services/access-control.service.spec.ts`:
- Test `checkMemoryAccess()` with integer trust levels
- Test escalation: deny → deny → block (no penalty)
- Verify `TRUST_PENALTY` no longer exists
- Test `resolveAccessorTrustLevel()` returns integers
- Test `formatAccessResultMessage()` shows labels not floats

### 3. Update/create trust-validator tests

In `src/services/trust-validator.service.spec.ts`:
- Test `validateTrustAssignment()` accepts 1–5, rejects 0, 6, 3.5
- Test `suggestTrustLevel()` returns correct integers for all content types
- Test tag overrides: 'public' → 1, 'private' → 5, 'secret' → 5

### 4. Test migration function

In `src/services/` or `src/migration/` spec:
- Test all 5 canonical float → int mappings
- Test intermediate floats (0.33 → 3, 0.6 → 2, etc.)
- Test idempotency (already-integer values pass through)

### 5. Update design documents

- `agent/design/trust-enforcement.md`: Update all tables, thresholds, code examples to integer 1–5
- `agent/design/ghost-persona-system.md`: Update GhostConfig examples, trust resolution examples
- `agent/design/access-control-result.md`: Update AccessResult examples

### 6. Update OpenAPI specs

- `docs/openapi.yaml`: Update trust_score field type/description
- `docs/openapi-web.yaml`: Same

### 7. Update migration guide

Add trust level redesign section:
- Breaking change: trust_score is now integer 1–5
- Semantics inverted: higher = more confidential
- Named labels available via `TRUST_LABELS`
- Migration script for existing data
- GhostConfig values changed (default_friend_trust: 2, default_public_trust: 1)

## Verification

- [ ] All trust-related tests pass with integer values
- [ ] No float trust values in any test
- [ ] Design docs updated (3 files)
- [ ] OpenAPI specs updated (2 files)
- [ ] Migration guide updated
- [ ] Full test suite passes (`npm test`)
