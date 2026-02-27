# Task 15: Migration Guide and Consumer Documentation

**Milestone**: [M4 - Integration & Packaging](../../milestones/milestone-4-integration-and-packaging.md)
**Estimated Time**: 3-4 hours
**Dependencies**: Task 13
**Status**: Not Started

---

## Objective
Create documentation showing how remember-mcp migrates to consume remember-core, and how remember-rest-server bootstraps using core services. This ensures both consumers have clear, actionable guidance for adopting the shared SDK.

---

## Context
There are two primary consumers of remember-core:
- **remember-mcp** (existing): Currently has business logic implemented inline within MCP tool handlers. Needs to replace that inline code with imports from remember-core, making tool handlers thin adapters that delegate to core services.
- **remember-rest-server** (new): A new Express/Hono REST API server that will expose the same business logic as HTTP endpoints, bootstrapping entirely from remember-core services.

The migration guide must be practical, with before/after code examples and a step-by-step checklist.

---

## Steps

### 1. Create docs/migration-guide.md
Write the migration guide for remember-mcp covering:
- **Before/After Examples**: Show each tool handler before (inline logic) and after (delegating to remember-core)
- **Step-by-Step Dependency Replacement**: How to add @prmichaelsen/remember-core as a dependency and remove duplicated code
- **Import Mapping**: Table mapping old internal imports to new remember-core imports
- **Breaking Changes**: Any API differences between the inline implementation and the core SDK
- Cover all 22 tool handlers with migration instructions

### 2. Create docs/rest-server-guide.md
Write the bootstrap guide for remember-rest-server covering:
- **Server Setup**: How to initialize an Express/Hono server with remember-core
- **Service Initialization**: How to create and configure core services (MemoryService, PreferenceService, etc.)
- **Example Routes**: Full working examples of REST endpoints calling core services (e.g., `POST /memories`, `GET /memories/search`, `PUT /preferences`)
- **Auth Middleware**: How to integrate authentication middleware with core services
- **Deployment**: Configuration and environment setup for production deployment

### 3. Update README.md
Update the project README with:
- Clear project description (what remember-core is and why it exists)
- Installation instructions (`npm install @prmichaelsen/remember-core`)
- Quick start code example
- API overview with links to subpath exports
- Links to migration guide and REST server guide

### 4. Create MIGRATION-CHECKLIST.md
Create a practical checklist document that teams can copy and track progress:
- Pre-migration preparation steps
- Per-handler migration checkboxes for all 22 tool handlers
- Post-migration validation steps
- Rollback procedures

---

## Verification
- [ ] Migration guide covers all 22 tool handlers with before/after examples
- [ ] REST server guide shows a working example that could be copy-pasted to bootstrap a server
- [ ] README has clear installation and quick start instructions
- [ ] All import examples in documentation are tested and resolve correctly
- [ ] No stale references to old module paths or removed APIs
- [ ] Documentation is internally consistent (no contradictions between guides)

---

## Expected Output

**Key Files Created**:
- `docs/migration-guide.md`: Complete migration guide for remember-mcp consumers
- `docs/rest-server-guide.md`: Bootstrap guide for remember-rest-server
- `README.md`: Updated project README with installation, usage, and links
- `MIGRATION-CHECKLIST.md`: Actionable checklist for tracking migration progress

---

## Notes
- The migration guide should be written so that each tool handler can be migrated independently (incremental migration)
- Include a "Common Pitfalls" section in the migration guide for issues discovered during development
- REST server guide should note that remember-rest-server is a separate repository/package
- Consider adding a `examples/` directory with runnable code samples if the documentation alone is insufficient
- Keep the README concise — detailed information belongs in the dedicated guide documents

---

**Next Task**: None (final task)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
