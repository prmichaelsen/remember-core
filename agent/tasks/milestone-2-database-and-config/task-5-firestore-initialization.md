# Task 5: Port Firestore Initialization and Paths

**Milestone**: [M2 - Database & Configuration](../../milestones/milestone-2-database-and-config.md)
**Estimated Time**: 2 hours
**Dependencies**: None (independent of types)
**Status**: Not Started

---

## Objective
Port Firebase Admin SDK initialization, Firestore document path utilities, and re-exported Firestore helpers from `remember-mcp` into `remember-core`.

---

## Context
Source files:
- `remember-mcp/src/firestore/init.ts` — Firebase Admin SDK init, re-exports getDocument/setDocument/addDocument/updateDocument/deleteDocument/queryDocuments/batchWrite
- `remember-mcp/src/firestore/paths.ts` — Firestore document paths (users/{userId}/preferences, users/{userId}/requests)
- Dependency: `@prmichaelsen/firebase-admin-sdk-v8`

---

## Steps

### 1. Read Firestore Source Files
Read Firestore source files from remember-mcp via `gh api`

### 2. Create Firebase Admin Initialization Module
Create `src/database/firestore/init.ts` with Firebase Admin initialization

### 3. Create Document Path Utilities
Create `src/database/firestore/paths.ts` with document path utilities

### 4. Create Barrel Exports
Create `src/database/firestore/index.ts` barrel exports

### 5. Add Firebase Admin Dependency
Add `@prmichaelsen/firebase-admin-sdk-v8` to package.json dependencies

### 6. Verify Compilation
Verify compilation

---

## Verification
- [ ] Firebase Admin SDK initializes correctly
- [ ] All Firestore helpers re-exported (get, set, add, update, delete, query, batch)
- [ ] Document paths correct for preferences and requests
- [ ] Exports clean from src/database/firestore/index.ts

---

## Expected Output

**Key Files Created**:
- `src/database/firestore/init.ts`: Firebase Admin SDK initialization and Firestore helper re-exports
- `src/database/firestore/paths.ts`: Firestore document path utilities
- `src/database/firestore/index.ts`: Barrel exports

---

## Notes
- Depends on `@prmichaelsen/firebase-admin-sdk-v8` package
- Re-exports common Firestore operations: getDocument, setDocument, addDocument, updateDocument, deleteDocument, queryDocuments, batchWrite
- Document paths follow pattern: users/{userId}/preferences, users/{userId}/requests

---

**Next Task**: [Task 6: Port Configuration Management](task-6-configuration-management.md)
**Related Design Docs**: [core-sdk architecture](../../design/core-sdk.architecture.md)
**Estimated Completion Date**: TBD
