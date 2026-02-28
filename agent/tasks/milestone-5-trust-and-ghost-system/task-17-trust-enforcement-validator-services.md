# Task 17: Port Trust Enforcement and Trust Validator Services

**Milestone**: [M5 - Trust & Ghost System](../../milestones/milestone-5-trust-and-ghost-system.md)
**Estimated Time**: 3 hours
**Dependencies**: Task 16 (types)
**Status**: Not Started

---

## Objective

Port the TrustEnforcement and TrustValidator services from remember-mcp. These provide trust-based memory filtering and content-aware trust level suggestions.

---

## Steps

### 1. Create `src/services/trust-enforcement.service.ts`

Port from `remember-mcp/src/services/trust-enforcement.ts`:
- `TRUST_THRESHOLDS` constant — 5 tiers (FULL_ACCESS 1.0, PARTIAL_ACCESS 0.75, SUMMARY_ONLY 0.5, METADATA_ONLY 0.25, EXISTENCE_ONLY 0.0)
- `FormattedMemory` interface
- `buildTrustFilter(collection, accessorTrustLevel)` — Weaviate filter for trust_score
- `formatMemoryForPrompt(memory, accessorTrustLevel, isSelfAccess?)` — 5-tier content redaction
- `getTrustLevelLabel(trust)` — human-readable label
- `getTrustInstructions(trust)` — LLM system prompt text
- `redactSensitiveFields(memory, trust)` — strip location, participants, environment
- `isTrustSufficient(memoryTrust, accessorTrust)` — boolean comparison
- `resolveEnforcementMode(mode?)` — default to 'query'

Design: Accept collection as parameter (DI pattern), no global imports.

### 2. Create `src/services/trust-validator.service.ts`

Port from `remember-mcp/src/services/trust-validator.ts`:
- `TrustValidationResult` interface — `{ valid: boolean; warning?: string }`
- `validateTrustAssignment(trustLevel, content?)` — validates 0-1 range, warns < 0.25
- `suggestTrustLevel(contentType, tags?)` — content-aware trust suggestion based on ContentType and tags

### 3. Update `src/services/index.ts`

Add barrel exports for both services.

---

## Verification

- [ ] `npm run build` succeeds
- [ ] Trust threshold constants exported
- [ ] formatMemoryForPrompt handles all 5 tiers
- [ ] suggestTrustLevel handles all content type categories

---

**Source Files**: `remember-mcp/src/services/trust-enforcement.ts`, `remember-mcp/src/services/trust-validator.ts`
**Next Task**: [Task 18](task-18-access-control-ghost-escalation-services.md)
