# Task 13: Public API Design and Barrel Exports

**Milestone**: [M4 - Integration & Packaging](../../milestones/milestone-4-integration-and-packaging.md)
**Estimated Time**: 2-3 hours
**Dependencies**: Task 12
**Status**: Not Started

---

## Objective
Design the public API surface with clean barrel exports and organized namespaces, ensuring no leaky abstractions. Consumers should be able to import cleanly: `import { MemoryService, Memory } from '@prmichaelsen/remember-core'` and use subpaths like `/types`, `/services`, `/database`, `/collections`, `/config`, `/testing`.

---

## Context
The remember-core package exposes multiple layers (types, services, database clients, configuration, collection utilities). Consumers should not need to know internal module structure. The root import should provide the most commonly used types and services, while subpath imports provide access to specialized modules. No Weaviate or Firestore internals should leak through the root export.

---

## Steps

### 1. Design Export Structure
Define the export hierarchy:
- **Root (`@prmichaelsen/remember-core`)**: Common types (Memory, Relationship, Preference, etc.) and primary services (MemoryService, PreferenceService, etc.)
- **`/types`**: All type definitions and interfaces
- **`/services`**: All service classes and factories
- **`/database`**: Weaviate and Firestore initialization utilities
- **`/collections`**: Collection schema definitions and utilities
- **`/config`**: Configuration management (environment, validation)
- **`/testing`**: Test helpers, mocks, and fixtures for consumer test suites

### 2. Create src/index.ts with Curated Exports
Build the root barrel file that re-exports only the public API surface:
- Import and re-export common types
- Import and re-export primary service classes
- Do NOT re-export database internals, collection schemas, or config details from root

### 3. Configure package.json Exports Map
Add conditional exports to package.json for each subpath:
```json
{
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./types": { "import": "./dist/types/index.js", "types": "./dist/types/index.d.ts" },
    "./services": { "import": "./dist/services/index.js", "types": "./dist/services/index.d.ts" },
    "./database": { "import": "./dist/database/index.js", "types": "./dist/database/index.d.ts" },
    "./collections": { "import": "./dist/collections/index.js", "types": "./dist/collections/index.d.ts" },
    "./config": { "import": "./dist/config/index.js", "types": "./dist/config/index.d.ts" },
    "./testing": { "import": "./dist/testing/index.js", "types": "./dist/testing/index.d.ts" }
  }
}
```

### 4. Verify No Internals Leak
Audit the root export to ensure:
- No Weaviate client types or classes are exposed
- No Firestore admin SDK types or classes are exposed
- No internal helper functions are exposed
- Only intentional public API is accessible

### 5. Add JSDoc on All Public Exports
Add JSDoc comments to every exported type, class, and function describing:
- Purpose and usage
- Parameter descriptions
- Return value descriptions
- Example usage where helpful

---

## Verification
- [ ] Root import provides Memory, Relationship, MemoryService, and other primary types/services
- [ ] Subpath imports (`/types`, `/services`, `/database`, etc.) resolve correctly
- [ ] No Weaviate or Firestore internals are accessible from root import
- [ ] TypeScript autocompletion works correctly for all exports
- [ ] No circular dependency warnings during build
- [ ] All public exports have JSDoc documentation

---

## Expected Output

**Key Files Created**:
- `src/index.ts`: Curated root barrel exports for the public API surface

---

## Notes
- The `/testing` subpath is important for consumers who need to mock core services in their own test suites
- Consider using `typesVersions` in package.json as a fallback for older TypeScript versions that don't support the exports map
- Run a circular dependency check tool (e.g., `madge --circular`) to catch issues early
- Document the export structure in the README for discoverability

---

**Next Task**: [Task 14: Integration Tests](task-14-integration-tests.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
