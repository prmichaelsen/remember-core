# Milestone 5: Trust & Ghost System

**Status**: Not Started
**Estimated Duration**: 1 week
**Dependencies**: M1-M4 (all complete)

---

## Goal

Extract the trust enforcement, access control, and ghost/persona system from remember-mcp (v3.9.0 → v3.13.0) into remember-core. This covers 6 new services, 3 new type files, schema updates, content type additions, and an updated migration guide.

## Context

remember-mcp advanced from v3.8.0 (our extraction baseline) to v3.13.0, adding:
- **v3.9.0**: AuthContext threading, CredentialsProvider (already ported)
- **v3.10.0**: Moderation system, SpaceConfig (partially ported)
- **v3.11.0**: AccessResult types, GhostConfig types, TrustEnforcement, TrustValidator, AccessControl services
- **v3.12.0**: GhostConfigService (Firestore CRUD), EscalationService, ghost-config tool handler
- **v3.13.0**: Server-side ghost mode via AuthContext.ghostMode

## Deliverables

1. **New types**: GhostConfig, TrustEnforcementMode, AccessResult (6 variants), GhostModeContext
2. **New services**: TrustEnforcementService, TrustValidatorService, AccessControlService, GhostConfigService, EscalationService, GhostConfigHandler
3. **Updated types**: AuthContext with ghostMode, ContentType with ghost/comment
4. **Updated schema**: ACL fields, moderation fields on v2-collections
5. **Tests**: Unit tests for all new services and types
6. **Migration guide**: Updated to cover trust/ghost system

## Success Criteria

- [ ] All new types compile and export correctly
- [ ] All new services pass unit tests
- [ ] Existing 142 tests still pass
- [ ] npm run build produces clean dist/
- [ ] Migration guide covers trust/ghost system extraction
- [ ] No remember-mcp-specific code (MCP SDK, transport, etc.)

## Tasks

- Task 16: Port Ghost Config and Access Result Types
- Task 17: Port Trust Enforcement and Trust Validator Services
- Task 18: Port Access Control, Ghost Config, and Escalation Services
- Task 19: Update Schema, Content Types, and AuthContext
- Task 20: Unit Tests for Trust & Ghost System
- Task 21: Update Migration Guide

## Source Files (remember-mcp)

| Source | Target |
|--------|--------|
| `src/types/ghost-config.ts` | `src/types/ghost-config.types.ts` |
| `src/types/access-result.ts` | `src/types/access-result.types.ts` |
| `src/types/auth.ts` (GhostModeContext) | `src/types/auth.types.ts` (update) |
| `src/services/trust-enforcement.ts` | `src/services/trust-enforcement.service.ts` |
| `src/services/trust-validator.ts` | `src/services/trust-validator.service.ts` |
| `src/services/access-control.ts` | `src/services/access-control.service.ts` |
| `src/services/ghost-config.service.ts` | `src/services/ghost-config.service.ts` |
| `src/services/escalation.service.ts` | `src/services/escalation.service.ts` |
| `src/tools/ghost-config.ts` (logic only) | `src/services/ghost-config-handler.service.ts` |
| `src/schema/v2-collections.ts` (fields) | `src/database/weaviate/v2-collections.ts` (update) |
| `src/constants/content-types.ts` (ghost/comment) | `src/constants/content-types.ts` (update) |
