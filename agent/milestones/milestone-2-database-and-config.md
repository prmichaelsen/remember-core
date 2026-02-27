# Milestone 2: Database & Configuration

**Goal**: Port the database initialization layer (Weaviate, Firestore), schema definitions, and configuration management from `remember-mcp` into `remember-core`
**Duration**: 1 week
**Dependencies**: M1 - Types & Models (schema references Memory types)
**Status**: Not Started

---

## Overview

This milestone extracts the database and config layers currently embedded in remember-mcp. The Weaviate client initialization, Firestore initialization, v2 collection schema definitions, and environment-based configuration all move to core. These are not transport-specific — they're infrastructure that any adapter needs.

---

## Deliverables

### 1. Weaviate Client & Schema
- Weaviate client initialization (local + cloud connection)
- v2 collection schema definitions (60+ properties per collection)
- 3 collection types: Memory_users_{userId}, Memory_spaces_public, Memory_groups_{groupId}
- Schema management functions (create, check, update)
- Space-specific schema definitions

### 2. Firestore Initialization
- Firebase Admin SDK initialization
- Re-exported Firestore helpers (getDocument, setDocument, addDocument, updateDocument, deleteDocument, queryDocuments, batchWrite)
- Document path utilities (users/{userId}/preferences, users/{userId}/requests)

### 3. Configuration Management
- Environment variable loading and validation (WEAVIATE_REST_URL, WEAVIATE_API_KEY, OPENAI_EMBEDDINGS_API_KEY, FIREBASE_*, etc.)
- Debug level enum and management (NONE, ERROR, WARN, INFO, DEBUG, TRACE)

### 4. Utility Modules
- Structured logger with debug level support
- Error handler utilities
- Weaviate filter builder (content type, tags, weight, trust, date, location, soft-delete filters)
- Test data generator

---

## Success Criteria

- [ ] Both MCP and REST servers can initialize databases via core
- [ ] Schema definitions are single-sourced in core
- [ ] Config validation catches missing env vars with clear error messages
- [ ] Firestore paths are consistent across consumers
- [ ] No transport-specific code in database layer
- [ ] Logger respects debug level configuration

---

## Key Files to Create

```
src/
├── database/
│   ├── weaviate/
│   │   ├── index.ts           (barrel exports)
│   │   ├── client.ts          (connection init)
│   │   ├── schema.ts          (collection management)
│   │   └── v2-collections.ts  (property definitions)
│   └── firestore/
│       ├── index.ts           (barrel exports)
│       ├── init.ts            (Firebase Admin init)
│       └── paths.ts           (document path utilities)
├── config/
│   ├── index.ts               (barrel exports)
│   ├── environment.ts         (env var loading/validation)
│   └── debug.ts               (debug level management)
└── utils/
    ├── index.ts               (barrel exports)
    ├── logger.ts              (structured logging)
    ├── error-handler.ts       (error formatting)
    └── filters.ts             (Weaviate filter builder)
```

---

## Tasks

1. [Task 4: Port Weaviate Client and Schema](../tasks/milestone-2-database-and-config/task-4-weaviate-client-schema.md) - client.ts, schema.ts, v2-collections.ts
2. [Task 5: Port Firestore Initialization and Paths](../tasks/milestone-2-database-and-config/task-5-firestore-initialization.md) - init.ts, paths.ts, Firebase Admin SDK
3. [Task 6: Port Configuration Management](../tasks/milestone-2-database-and-config/task-6-configuration-management.md) - config.ts, env validation, debug levels
4. [Task 7: Port Utility Modules](../tasks/milestone-2-database-and-config/task-7-utility-modules.md) - logger, error-handler, filters

---

## Environment Variables

```env
# Weaviate
WEAVIATE_REST_URL=http://localhost:8080
WEAVIATE_API_KEY=your_key_here

# OpenAI Embeddings
OPENAI_EMBEDDINGS_API_KEY=your_key_here

# Firebase
FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY={"type":"service_account",...}
FIREBASE_PROJECT_ID=your-project-id

# Debug
REMEMBER_MCP_DEBUG_LEVEL=INFO
```

---

## Testing Requirements

- [ ] Config validation unit tests (missing vars, invalid values)
- [ ] Logger output tests at each debug level
- [ ] Filter builder unit tests for each filter type

---

## Documentation Requirements

- [ ] Environment variable documentation (.env.example)
- [ ] Database connection setup guide

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation Strategy |
|------|--------|-------------|---------------------|
| Weaviate client API changes between versions | Medium | Low | Pin weaviate-client to v3.2.0 |
| Firebase Admin SDK initialization complexity | Medium | Medium | Use existing @prmichaelsen/firebase-admin-sdk-v8 wrapper |

---

**Next Milestone**: [Milestone 3: Core Services](milestone-3-core-services.md)
**Blockers**: None
**Notes**: Dependencies: weaviate-client ^3.2.0, @prmichaelsen/firebase-admin-sdk-v8 ^2.2.0, dotenv ^16.4.5
