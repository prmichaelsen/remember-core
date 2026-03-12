# Hierarchical Relationships

**Concept**: Allow relationships to contain other relationships, enabling umbrella/parent-child grouping of related clusters
**Created**: 2026-03-12
**Status**: Proposal

---

## Overview

Relationships today are flat — each one references a set of memory IDs and nothing else. This design adds a `relationship_ids` field so a relationship can reference child relationships, forming a tree. This enables umbrella organization where a parent relationship (e.g., "autonomous film") groups sub-relationships (e.g., "technical notes", "script snippets", "character sketches") under a single navigable hierarchy.

---

## Problem Statement

- **Flat relationships can't represent project structure**: A user working on an autonomous film project has memories organized into REM-discovered clusters (technical notes, script fragments, character concepts). These clusters are related to each other but the only way to express that today is a single mega-relationship containing all memories — losing the sub-grouping.
- **No umbrella concept**: Users can't say "show me everything under my film project" and get back organized sub-categories. They'd get a flat list of memories.
- **REM can't express hierarchy**: When REM discovers that several relationships all relate to one overarching theme, it has no mechanism to link them together.

---

## Solution

Add an explicit `relationship_ids: string[]` field to the Relationship type, separate from `memory_ids`. A relationship with `relationship_ids` is an **umbrella relationship** — it groups child relationships (and optionally direct memories) under one observation/label.

```
Relationship "autonomous-film" (type: "umbrella")
├─ memory_ids: ["film-synopsis"]            ← direct memories
├─ relationship_ids: [                      ← child relationships
│    "rel-technical-notes",
│    "rel-script-snippets",
│    "rel-character-sketches"
│  ]
│
├─ Relationship "rel-technical-notes"
│  └─ memory_ids: ["note1", "note2", "note3"]
│
├─ Relationship "rel-script-snippets"
│  └─ memory_ids: ["snippet1", "snippet2"]
│
└─ Relationship "rel-character-sketches"
   └─ memory_ids: ["char1", "char2"]
```

**Why a separate array instead of overloading `memory_ids`?**

Every consumer of `memory_ids` today assumes the IDs reference memories: validation checks `doc_type === 'memory'`, bidirectional linking updates memory documents, `computeOverlap()` compares memory sets, REM clustering fetches memory content, curation scoring builds a memory graph, and SpaceService queries filter by memory containment. Mixing relationship IDs into `memory_ids` would break all of these. A separate field lets existing code work untouched while new hierarchy-aware code opts in explicitly.

**Alternatives considered:**
- **Overload `memory_ids`**: Rejected — breaks validation, bidirectional linking, overlap computation, REM clustering, curation scoring, and SpaceService queries (see above)
- **Separate `doc_type: 'relationship_group'`**: Rejected — adds a new document type with duplicate CRUD logic; extending the existing Relationship type is simpler
- **Use REM abstraction pattern (summary memory + relationship)**: Works today but doesn't give true nested structure — the "parent" is a memory, not a relationship, so it can't be navigated as a hierarchy

---

## Implementation

### Type Changes (`src/types/memory.types.ts`)

```typescript
export interface Relationship {
  // ... existing fields ...

  // Hierarchy (new)
  relationship_ids?: string[];          // Child relationship IDs
  parent_relationship_id?: string;      // Inverse pointer to parent (denormalized)
  child_relationship_count?: number;    // Denormalized count of relationship_ids
}
```

### Schema Changes (`src/database/weaviate/v2-collections.ts`)

Add to `COMMON_MEMORY_PROPERTIES`:

```typescript
{ name: 'relationship_ids', dataType: configure.dataType.TEXT_ARRAY },
{ name: 'parent_relationship_id', dataType: configure.dataType.TEXT },
{ name: 'child_relationship_count', dataType: configure.dataType.INT },
```

No migration needed — Weaviate auto-reconciliation adds new properties to existing collections.

### Service Changes (`src/services/relationship.service.ts`)

#### Validation

New `validateRelationshipIds()` method:
- Fetch each ID from collection
- Assert `doc_type === 'relationship'` and not deleted
- Assert no circular references (a relationship cannot be its own ancestor)

```typescript
private async validateRelationshipIds(
  collection: any,
  relationshipIds: string[],
  selfId?: string,
): Promise<void> {
  for (const id of relationshipIds) {
    const obj = await collection.query.fetchObjectById(id);
    if (!obj) throw new NotFoundError(`Relationship ${id} not found`);
    if (obj.properties.doc_type !== 'relationship')
      throw new ValidationError(`${id} is not a relationship`);
    if (obj.properties.deleted) throw new ValidationError(`${id} is deleted`);
    // Cycle detection: walk parent_relationship_id chain
    if (selfId) {
      let current = obj;
      while (current?.properties?.parent_relationship_id) {
        if (current.properties.parent_relationship_id === selfId)
          throw new ValidationError(`Circular reference detected: ${id} is an ancestor of ${selfId}`);
        current = await collection.query.fetchObjectById(
          current.properties.parent_relationship_id,
        );
      }
    }
  }
}
```

#### Create

Extend `CreateRelationshipInput`:

```typescript
export interface CreateRelationshipInput {
  // ... existing fields ...
  relationship_ids?: string[];  // Optional child relationships
}
```

In `create()`:
1. Validate `relationship_ids` if provided
2. Store `relationship_ids` and `child_relationship_count`
3. Set `parent_relationship_id` on each child relationship (bidirectional link)

#### Update

Extend `UpdateRelationshipInput`:

```typescript
export interface UpdateRelationshipInput {
  // ... existing fields ...
  add_relationship_ids?: string[];
  remove_relationship_ids?: string[];
}
```

In `update()`:
1. Validate new relationship IDs
2. Deduplicate against existing
3. Update `child_relationship_count`
4. Manage `parent_relationship_id` on children (add/remove)

#### Delete

In `delete()`:
- When deleting a parent: clear `parent_relationship_id` on all children (orphan them, don't cascade)
- When deleting a child: remove its ID from parent's `relationship_ids` and decrement `child_relationship_count`

#### New Query Methods

```typescript
// Get all child relationships of a parent
async findChildRelationships(
  collection: any,
  parentId: string,
): Promise<Relationship[]>

// Get the full hierarchy tree (recursive, with depth limit)
async getHierarchy(
  collection: any,
  rootId: string,
  maxDepth?: number,
): Promise<RelationshipTree>

// Flatten: collect all transitive memory_ids
async flattenMemoryIds(
  collection: any,
  relationshipId: string,
  maxDepth?: number,
): Promise<string[]>
```

### API Changes (`docs/openapi.yaml`)

- Add `relationship_ids` to relationship create/update request bodies
- Add `parent_relationship_id` to relationship response schema
- Add `GET /relationships/{id}/children` endpoint
- Add `GET /relationships/{id}/flatten` endpoint (returns all transitive memory IDs)

---

## Benefits

- **Natural project organization**: Users can group related clusters under umbrella themes
- **Navigable hierarchy**: "Show me everything under autonomous film" returns organized sub-categories, not a flat dump
- **REM extensibility**: Future REM phases can auto-discover umbrella relationships when multiple clusters share a theme
- **Backward compatible**: Existing relationships with only `memory_ids` work exactly as before
- **No migration**: Weaviate auto-reconciliation adds the new properties

---

## Trade-offs

- **Recursive queries**: Flattening a deep hierarchy requires multiple Weaviate fetches. Mitigated by depth limits (default: 5) and expected shallow trees (2-3 levels typical).
- **Cycle detection cost**: Validating no circular references walks the parent chain on create/update. Mitigated by short chains in practice and early termination.
- **Denormalization maintenance**: `parent_relationship_id` and `child_relationship_count` must stay in sync during CRUD. Mitigated by centralizing in RelationshipService methods.
- **Single parent constraint**: A child relationship can only have one parent (tree, not DAG). This simplifies cycle detection and navigation. If DAG support is needed later, `parent_relationship_id` could become `parent_relationship_ids`.

---

## Dependencies

- `src/types/memory.types.ts` — Relationship interface
- `src/database/weaviate/v2-collections.ts` — Schema properties
- `src/services/relationship.service.ts` — CRUD logic
- `docs/openapi.yaml` — REST API spec

---

## Testing Strategy

- **Unit tests** (`relationship.service.spec.ts`):
  - Create umbrella relationship with child relationships
  - Validate circular reference detection
  - Update: add/remove child relationships
  - Delete parent: children orphaned correctly
  - Delete child: parent's relationship_ids updated
  - `flattenMemoryIds()` returns transitive closure
  - Mixed: umbrella with both memory_ids and relationship_ids

- **Edge cases**:
  - Empty `relationship_ids` (valid — just a normal relationship)
  - Deeply nested hierarchy (3+ levels, depth limit enforced)
  - Attempt to create cycle (should throw)
  - Attempt to add non-existent relationship ID (should throw)
  - Attempt to add a memory ID to `relationship_ids` (should throw)

---

## Migration Path

1. Add new properties to `memory.types.ts` and `v2-collections.ts` — auto-reconciled, no data migration
2. Extend `RelationshipService` with validation, CRUD changes, and new query methods
3. Update OpenAPI spec and REST handlers
4. Update client SDKs (svc + app) to expose hierarchy operations
5. (Future) Teach REM to discover umbrella relationships across related clusters

---

## Key Design Decisions

### Data Model

| Decision | Choice | Rationale |
|---|---|---|
| Separate `relationship_ids` vs overload `memory_ids` | Separate array | Every consumer of `memory_ids` assumes memory references — overloading breaks validation, linking, overlap, clustering, curation, and search |
| Tree vs DAG | Tree (single parent) | Simplifies cycle detection and navigation; DAG can be added later if needed |
| Cascade vs orphan on parent delete | Orphan children | Deleting a parent shouldn't destroy child clusters — they remain valid standalone |

### Naming

| Decision | Choice | Rationale |
|---|---|---|
| `relationship_type` for umbrellas | `"umbrella"` or `"contains"` | Free-form field, no schema change needed. Users/REM can use any descriptive type |
| Inverse pointer field name | `parent_relationship_id` | Matches existing `parent_id` pattern on memories (comment threading) |

---

## Future Considerations

- **REM umbrella discovery**: A new REM phase that detects when multiple relationships share overlapping themes and auto-creates an umbrella relationship
- **DAG support**: Allow multiple parents per relationship (requires cycle detection upgrade)
- **Hierarchy-aware search**: "Search within this umbrella" scoped to transitive memory_ids
- **GUI tree view**: Render relationship hierarchies as collapsible trees in the web app
- **Depth-limited flattening cache**: Precompute and cache transitive memory_ids for fast reads

---

**Status**: Proposal
**Recommendation**: Implement as a focused milestone — type changes, service CRUD, tests, API
**Related Documents**: [local.rem-background-relationships.md](local.rem-background-relationships.md), [local.relationship-gui-app-endpoints.md](local.relationship-gui-app-endpoints.md)
