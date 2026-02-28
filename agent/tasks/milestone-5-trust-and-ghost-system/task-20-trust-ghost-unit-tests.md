# Task 20: Unit Tests for Trust & Ghost System

**Milestone**: [M5 - Trust & Ghost System](../../milestones/milestone-5-trust-and-ghost-system.md)
**Estimated Time**: 4 hours
**Dependencies**: Tasks 16-19
**Status**: Not Started

---

## Objective

Write comprehensive unit tests for all new trust & ghost system types and services. Target: full coverage of trust enforcement tiers, access control resolution paths, ghost config CRUD, escalation prevention, and permission resolution.

---

## Steps

### 1. Create `src/services/__tests__/trust-enforcement.service.spec.ts`

Test cases:
- `TRUST_THRESHOLDS` constant values (5 tiers)
- `buildTrustFilter()` — generates correct Weaviate filter for various trust levels
- `formatMemoryForPrompt()` — 5 test cases, one per tier:
  - 1.0: Full content, location, tags
  - 0.75: Redacted sensitive fields, city+state
  - 0.5: Summary only, city
  - 0.25: Metadata only (title, type, tags, no content)
  - 0.0: Existence hint only
- `getTrustLevelLabel()` — returns correct label for each tier
- `getTrustInstructions()` — returns non-empty string for each tier
- `redactSensitiveFields()` — strips location, participants, environment
- `isTrustSufficient()` — boundary tests (exact match, above, below)
- `resolveEnforcementMode()` — defaults to 'query', accepts all 3 modes

### 2. Create `src/services/__tests__/trust-validator.service.spec.ts`

Test cases:
- `validateTrustAssignment()`:
  - Valid: 0, 0.5, 1.0
  - Invalid: -0.1, 1.1, NaN, null
  - Warning: < 0.25 (very restrictive)
- `suggestTrustLevel()`:
  - Personal content types → lower trust (0.25–0.5)
  - Professional/reference types → higher trust (0.75–1.0)
  - Tags override: 'private' tag → lower suggestion
  - Unknown content type → default suggestion

### 3. Create `src/services/__tests__/access-control.service.spec.ts`

Test cases (one per resolution path):
- Not found → `{ status: 'not_found' }`
- Deleted → `{ status: 'deleted', deleted_at }`
- Owner access → `{ status: 'granted', access_level: 'owner' }`
- No permission → `{ status: 'no_permission' }`
- Blocked → `{ status: 'blocked', reason, blocked_at }`
- Insufficient trust → `{ status: 'insufficient_trust', trust_deficit, attempts_remaining }`
- Granted (trusted) → `{ status: 'granted', access_level: 'trusted' }`
- `formatAccessResult()` — correct message for each variant
- `canRevise()` — owner_only, group_editors (with/without credentials), anyone modes
- `canOverwrite()` — explicit ID grants, write mode fallbacks

### 4. Create `src/services/__tests__/ghost-config.service.spec.ts`

Test cases:
- `getConfig()` — returns DEFAULT_GHOST_CONFIG when no Firestore doc exists
- `getConfig()` — returns stored config when it exists
- `updateConfig()` — partial update merges correctly
- `setUserTrust()` — adds/updates per_user_trust entry
- `blockUser()` — adds to blocked_users array
- `unblockUser()` — removes from blocked_users array
- `isBlocked()` — true for blocked users, false otherwise
- `resolveTrustLevel()` — blocked → null, per-user override, friend default, public default
- Trust resolution priority order test

### 5. Create `src/services/__tests__/escalation.service.spec.ts`

Test cases:
- First failed attempt → count = 1, trust reduced by 0.1
- Second failed attempt → count = 2, trust reduced by 0.2 total
- Third failed attempt → blocked, owner notified
- `isBlocked()` → true after 3 attempts
- `resetBlock()` → clears block, resets counter
- `getAttemptCount()` → returns correct count
- Trust floor at 0 (never goes negative)

### 6. Create `src/types/__tests__/access-result.types.spec.ts`

Type-level tests:
- Each AccessResult variant has correct status literal
- Union narrows correctly in switch statements
- AccessResultStatus includes all 6 values

---

## Verification

- [ ] All new test suites pass
- [ ] All existing 142 tests still pass
- [ ] `npm run test` reports 0 failures
- [ ] Coverage: every public function in new services tested
- [ ] Every AccessResult variant tested

---

**Expected Test Count**: ~80-100 new tests across 6 suites
**Next Task**: [Task 21](task-21-update-migration-guide.md)
