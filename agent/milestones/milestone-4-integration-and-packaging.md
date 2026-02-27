# Milestone 4: Integration & Packaging

**Goal**: Package remember-core as an NPM module, define clean public exports, write integration tests, and create migration guides for consumers
**Duration**: 1 week
**Dependencies**: M1 - Types & Models, M2 - Database & Configuration, M3 - Core Services
**Status**: Not Started

---

## Overview

This milestone makes remember-core consumable. It defines the public API surface, sets up NPM packaging with proper exports, creates integration tests that validate the full stack (types -> config -> database -> services), and provides migration guides for remember-mcp and the new remember-rest-server.

---

## Deliverables

### 1. NPM Package Configuration
- package.json with @prmichaelsen/remember-core name
- TypeScript declaration files (.d.ts)
- esbuild production build
- Exports map for subpath imports
- .npmignore (exclude source, tests, agent/)

### 2. Public API & Barrel Exports
- src/index.ts with curated root exports
- Subpath exports: /types, /services, /database, /collections, /config, /testing
- No leaky abstractions (internal Weaviate/Firestore details hidden)

### 3. Integration Tests
- Memory lifecycle: create -> search -> update -> delete
- Preferences lifecycle: create defaults -> update -> read
- Confirmation token lifecycle: create -> validate -> confirm
- Space publish flow: create -> publish -> search space -> retract

### 4. Consumer Documentation
- Migration guide for remember-mcp (20 tool handler transformations)
- Bootstrap guide for remember-rest-server
- Updated README with installation and usage

---

## Success Criteria

- [ ] `npm run build` succeeds with clean output
- [ ] `npm pack` produces installable package
- [ ] remember-mcp can `npm install` core and import all services
- [ ] Integration tests pass against real or emulated databases
- [ ] Migration guide covers all 20 tool handler transformations
- [ ] REST server can be bootstrapped using core services

---

## Key Files to Create

```
remember-core/
├── package.json              (NPM package config)
├── src/
│   └── index.ts              (curated root exports)
├── tests/
│   └── e2e/
│       ├── memory.e2e.ts     (memory lifecycle)
│       ├── preferences.e2e.ts (preferences lifecycle)
│       ├── tokens.e2e.ts     (confirmation tokens)
│       └── spaces.e2e.ts     (space publish flow)
├── docs/
│   ├── migration-guide.md    (remember-mcp migration)
│   └── rest-server-guide.md  (REST server bootstrap)
└── jest.e2e.config.js        (e2e test config)
```

---

## Tasks

1. [Task 12: NPM Package Setup](../tasks/milestone-4-integration-and-packaging/task-12-npm-package-setup.md) - package.json, tsconfig, esbuild, exports map
2. [Task 13: Public API Design and Barrel Exports](../tasks/milestone-4-integration-and-packaging/task-13-public-api-exports.md) - src/index.ts, subpath exports
3. [Task 14: Integration Tests](../tasks/milestone-4-integration-and-packaging/task-14-integration-tests.md) - End-to-end service flows
4. [Task 15: Migration Guide and Consumer Documentation](../tasks/milestone-4-integration-and-packaging/task-15-migration-guide.md) - remember-mcp migration, REST server guide

---

## Testing Requirements

- [ ] Integration tests for all major flows
- [ ] Tests are independent and self-cleaning
- [ ] `npm run test:e2e` script documented

---

## Documentation Requirements

- [ ] README.md with package overview, installation, quick start, API overview
- [ ] Migration guide with before/after examples for each tool handler
- [ ] REST server bootstrap guide with working examples
- [ ] MIGRATION-CHECKLIST.md for remember-mcp

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Public API surface too broad (leaky abstractions) | High | Medium | Review all exports, hide database internals by default |
| remember-mcp migration breaks existing deployments | High | Medium | Provide incremental migration path, not big-bang |
| Integration tests require live databases | Medium | High | Support both real DB and emulator/mock modes |

---

**Next Milestone**: None (final milestone)
**Blockers**: None
**Notes**: After this milestone, remember-mcp should depend on @prmichaelsen/remember-core and tool handlers become thin adapters.
