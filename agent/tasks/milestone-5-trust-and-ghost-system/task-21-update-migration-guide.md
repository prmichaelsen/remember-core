# Task 21: Update Migration Guide

**Milestone**: [M5 - Trust & Ghost System](../../milestones/milestone-5-trust-and-ghost-system.md)
**Estimated Time**: 1.5 hours
**Dependencies**: Tasks 16-20
**Status**: Not Started

---

## Objective

Update the migration guide (`docs/migration-guide.md`) and CHANGELOG to cover the new trust & ghost system modules. Add import examples, API reference for new services, and schema migration notes for consumers.

---

## Steps

### 1. Update `docs/migration-guide.md`

Add new section: **Trust & Ghost System** (after existing tool mapping table)

Include:
- **New type imports**: GhostConfig, TrustEnforcementMode, AccessResult, GhostModeContext, AccessGranted, AccessInsufficientTrust, etc.
- **New service imports**: TrustEnforcementService, TrustValidatorService, AccessControlService, GhostConfigService, EscalationService, GhostConfigHandler
- **Trust enforcement quick start**: TRUST_THRESHOLDS, buildTrustFilter(), formatMemoryForPrompt() usage
- **Access control pattern**: checkMemoryAccess() → switch on status
- **Ghost config setup**: getConfig/updateConfig/setUserTrust
- **Schema migration**: 7 new fields on published memories (all nullable, no backfill needed)
- **Content type additions**: 'ghost', 'comment'
- **Permission resolution**: canRevise(), canOverwrite() with write modes

### 2. Add subpath import examples

```typescript
// Types
import type { GhostConfig, AccessResult, GhostModeContext } from '@prmichaelsen/remember-core/types';

// Services
import { TrustEnforcementService, AccessControlService } from '@prmichaelsen/remember-core/services';
import { TRUST_THRESHOLDS } from '@prmichaelsen/remember-core/services';

// Updated schema
import { PUBLISHED_MEMORY_PROPERTIES } from '@prmichaelsen/remember-core/database';

// Updated content types
import { CONTENT_TYPES } from '@prmichaelsen/remember-core/constants';
```

### 3. Update CHANGELOG.md

Add `[0.13.0]` entry documenting all M5 additions.

### 4. Update README.md

Add trust & ghost system to the feature list and quick start section.

---

## Verification

- [ ] Migration guide has clear import examples for all new modules
- [ ] CHANGELOG accurately reflects all M5 changes
- [ ] All import paths in guide actually resolve
- [ ] No remember-mcp-specific references remain (MCP SDK, tool names, etc.)

---

**Source Files**: `docs/migration-guide.md`, `CHANGELOG.md`, `README.md`
