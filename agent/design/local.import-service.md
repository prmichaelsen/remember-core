# Import Service

**Concept**: Bulk memory import — chunk large text into individual memories with parent summaries and relationships
**Created**: 2026-03-04
**Status**: Design Specification
**Source**: agentbase.me/agent/design/local.large-message-import.md

---

## Overview

Users want to import large amounts of text data into their memory space — journal entries, notes, articles, exported documents. Today, remember-core has no mechanism to accept a large block of text and split it into appropriately-sized memories for RAG retrieval.

This design adds an `ImportService` to remember-core that handles:
1. Token-count chunking with paragraph-boundary awareness
2. Batch memory creation (one per chunk)
3. Parent summary generation via HaikuClient
4. Relationship linking between parent summary and child chunks

The service is transport-agnostic — consumed by both the SVC REST API and MCP tools, following the same pattern as `MemoryService`, `RelationshipService`, and `SpaceService`.

---

## Problem Statement

- No mechanism exists in remember-core to convert large text into multiple retrievable memories
- Consumers (agentbase.me, remember-mcp-server) would need to orchestrate chunking, batch creation, and relationship linking themselves — duplicating logic across deployment targets
- remember-core already has sub-LLM access (HaikuClient) and all the primitives (MemoryService.create, RelationshipService.create) — it should own the orchestration
- Without a centralized service, each consumer implements chunking differently, leading to inconsistent chunk sizes and relationship structures

---

## Solution

### ImportService

A new service in `src/services/import.service.ts` that accepts one or more items (raw text or pre-resolved file content), chunks each by token count, creates memories, generates a parent summary via HaikuClient, and links everything with relationships.

### Architecture

```
Consumer (agentbase.me, MCP server, CLI)
  |
  v
ImportService.import(items)
  |
  ├─ For each item:
  │   ├─ chunkByTokens(content, ~3K tokens)
  │   ├─ MemoryService.create() per chunk
  │   │   (tags: ["import:{importId}"], content: "[CHUNK 00001]\n\n{text}")
  │   ├─ HaikuClient.extractFeatures(full content)
  │   │   → generates summary for parent memory
  │   ├─ MemoryService.create() for parent summary
  │   │   (tags: ["import:{importId}", "import_summary"])
  │   └─ RelationshipService.create() per chunk
  │       (type: "part_of", linking chunk → parent)
  │
  └─ Return ImportResult (item summaries, memory IDs, chunk counts)
```

### Key Design Decisions

- **Token-count chunking**: Split on paragraph boundaries within a ~3K token budget. Simple, predictable, good RAG granularity.
- **Raw splits**: No agent-generated titles per chunk. MemoryService and remember-core's existing ingest pipeline handle title/summary generation via content_type defaults.
- **Parent summary via HaikuClient**: Uses `extractFeatures()` to generate a summary of the full content (or a representative sample if content exceeds context limits). Parent memory stores the summary + import metadata.
- **Ordering markers**: Each chunk includes `[CHUNK 00001]` prefix for sequence reconstruction.
- **Shared import ID**: UUID per item, applied as a tag to all chunks + parent for grouping.
- **`part_of` relationships**: Each chunk linked to its parent summary. No `sequence` relationships between chunks (ordering is in the markers, relationships would be O(N^2)).

### Alternatives Considered

- **Semantic chunking**: Split on topic boundaries using LLM. Rejected for MVP — adds latency and complexity. Token-count with paragraph awareness is sufficient.
- **Consumer-side orchestration**: Let agentbase.me call MemoryService.create in a loop. Rejected — duplicates logic across consumers, misses relationship linking.
- **Single giant memory**: Store the full text as one memory. Rejected — exceeds RAG retrieval granularity, wastes context tokens.

---

## Implementation

### 1. Input/Output Types

```typescript
interface ImportItem {
  content: string          // Raw text content (pre-resolved by consumer)
  source_filename?: string // Original filename, for metadata
}

interface ImportInput {
  items: ImportItem[]      // 1+ items to import
  chunk_size?: number      // Max tokens per chunk (default: 3000)
  context_conversation_id?: string  // Conversation that triggered import
}

interface ImportItemResult {
  import_id: string        // UUID for this item
  parent_memory_id: string // Summary memory ID
  chunk_memory_ids: string[] // Ordered chunk memory IDs
  chunk_count: number
  source_filename?: string
  summary: string          // Generated summary text
}

interface ImportResult {
  items: ImportItemResult[]
  total_memories_created: number
}
```

### 2. Constructor & Dependencies

```typescript
class ImportService {
  constructor(
    private memoryService: MemoryService,
    private relationshipService: RelationshipService,
    private haikuClient: HaikuClient,
    private logger: Logger,
  ) {}
}
```

Follows the same DI pattern as other services. The consumer (REST handler, MCP tool handler) wires dependencies when constructing the service.

### 3. Chunking Logic

```
chunkByTokens(text, maxTokensPerChunk):
  Split text on paragraph boundaries (\n\n+)
  Accumulate paragraphs until token budget exceeded
  Flush accumulated text as a chunk
  Continue until all paragraphs consumed

  Token estimation: ceil(text.length / 4)
    ~4 chars per token for English text
    Approximate, no tokenizer dependency

  Edge cases:
    - Single paragraph exceeds budget → emit as-is (oversized chunk)
    - No paragraph breaks → fall back to character-count split at ~12K chars
    - Empty input → return empty array
```

Chunk size default: 3000 tokens (~12K chars). This gives good RAG retrieval granularity while keeping enough context per chunk to be useful standalone. With a 30K token context budget, 2-4 chunks can be loaded alongside conversation history.

### 4. Import Flow

```
import(input: ImportInput):
  results = []

  For each item in input.items:
    import_id = uuid()
    chunks = chunkByTokens(item.content, input.chunk_size ?? 3000)
    chunk_memory_ids = []

    // 1. Create chunk memories
    For i, chunk in chunks:
      result = memoryService.create({
        content: "[CHUNK ${padStart(i+1, 5, '0')}]\n\n${chunk}",
        tags: ["import:${import_id}"],
        context_summary: "Chunk ${i+1} of ${chunks.length} from import",
        context_conversation_id: input.context_conversation_id,
      })
      chunk_memory_ids.push(result.memory_id)

    // 2. Generate parent summary
    sample = item.content.substring(0, 16000)  // ~4K tokens for Haiku
    extraction = haikuClient.extractFeatures(sample)
    summary_text = extraction.summary
      || "Imported ${chunks.length} chunks from ${item.source_filename || 'pasted text'}"

    // 3. Create parent summary memory
    parent = memoryService.create({
      content: "Import summary: ${summary_text}\n"
             + "Source: ${item.source_filename || 'pasted text'}\n"
             + "Chunks: ${chunks.length}\n"
             + "Import ID: ${import_id}",
      tags: ["import:${import_id}", "import_summary"],
      context_summary: "Import summary for ${item.source_filename || 'pasted text'}",
      context_conversation_id: input.context_conversation_id,
    })

    // 4. Link chunks to parent
    For each chunk_id in chunk_memory_ids:
      relationshipService.create({
        memory_ids: [parent.memory_id, chunk_id],
        relationship_type: "part_of",
        observation: "Chunk from import ${import_id}",
        source: "rule",
        tags: ["import:${import_id}"],
      })

    results.push({
      import_id,
      parent_memory_id: parent.memory_id,
      chunk_memory_ids,
      chunk_count: chunks.length,
      source_filename: item.source_filename,
      summary: summary_text,
    })

  Return {
    items: results,
    total_memories_created: sum of (1 parent + N chunks) per item,
  }
```

### 5. REST Endpoint

```
POST /api/svc/v1/memories/import

Body:
{
  "items": [
    { "content": "...", "source_filename": "notes.txt" },
    { "content": "...", "source_filename": "journal.txt" }
  ],
  "chunk_size": 3000,
  "context_conversation_id": "conv-123"
}

Response:
{
  "items": [
    {
      "import_id": "uuid-1",
      "parent_memory_id": "mem-parent-1",
      "chunk_memory_ids": ["mem-c1", "mem-c2", "mem-c3"],
      "chunk_count": 3,
      "source_filename": "notes.txt",
      "summary": "Personal notes about..."
    }
  ],
  "total_memories_created": 8
}
```

Nested under `/memories/` since the primary output is memories.

### 6. SVC Client SDK Method

```typescript
// src/clients/svc/v1/memories.ts — add to MemoriesResource

interface ImportInput {
  items: Array<{ content: string; source_filename?: string }>
  chunk_size?: number
  context_conversation_id?: string
}

interface MemoriesResource {
  // ... existing methods ...
  import(userId: string, input: ImportInput): Promise<SdkResponse<ImportResult>>
}

// Implementation:
import(userId, input) {
  return http.request('POST', '/api/svc/v1/memories/import', { userId, body: input })
}
```

### 7. OpenAPI Spec

Define the import endpoint in the OpenAPI spec (`docs/openapi.yaml`) so that request/response types for the SVC client SDK are generated rather than hand-written. This follows the existing pattern — `openapi-typescript` generates types from the spec, and the SVC client references them.

```yaml
/api/svc/v1/memories/import:
  post:
    summary: Bulk import text into memories
    operationId: importMemories
    requestBody:
      required: true
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/ImportInput'
    responses:
      '200':
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/ImportResult'
```

The `ImportInput` and `ImportResult` schemas should be defined in `components/schemas` alongside the existing memory schemas.

### 8. File Structure

```
docs/
  openapi.yaml              # Add import endpoint + schemas

src/services/
  import.service.ts          # ImportService class
  import.service.spec.ts     # Colocated unit tests

src/clients/svc/v1/
  memories.ts                # Add import() method to MemoriesResource (types from generated spec)
```

No new barrel exports needed beyond adding `ImportService` and its types to `src/services/index.ts`.

---

## Benefits

- **Single source of truth** — chunking logic lives in remember-core, not duplicated across consumers
- **Transport-agnostic** — same service backs MCP tools, REST API, and direct SDK usage
- **Reuses existing primitives** — MemoryService.create, RelationshipService.create, HaikuClient.extractFeatures
- **Good RAG granularity** — 3K token chunks are ideal for retrieval
- **Follows established patterns** — DI constructor, Input/Result types, colocated tests

---

## Trade-offs

- **No semantic splitting** — token-count splits may cut between related paragraphs. Mitigated by splitting on paragraph boundaries within budget.
- **No deduplication** — importing the same content twice creates duplicate memories. Acceptable for MVP.
- **Token estimation is approximate** — `chars/4` is rough. Could over/under-split. Acceptable; not worth a tokenizer dependency.
- **Sequential chunk creation** — each chunk is a separate `MemoryService.create` call. Could be slow for large imports (50+ chunks). Future optimization: batch Weaviate inserts.
- **HaikuClient sample limit** — only the first ~4K tokens are sent for summary generation. Long documents may have a summary that only reflects the beginning. Acceptable for MVP.

---

## Dependencies

- `MemoryService` — memory creation
- `RelationshipService` — linking chunks to parent
- `HaikuClient` — summary generation via `extractFeatures()`
- `uuid` — already a dependency in remember-core
- `Logger` — standard logging

No new external dependencies required.

---

## Testing Strategy

- **Unit: `chunkByTokens`** — correct splitting on paragraph boundaries, correct chunk count, correct markers, edge cases (empty, no paragraphs, single oversized paragraph, Unicode)
- **Unit: `ImportService.import`** — mock MemoryService, RelationshipService, HaikuClient. Verify correct number of creates, correct tags, correct relationship linking, correct ImportResult shape.
- **Unit: token estimation** — verify reasonable accuracy on sample English text
- **Integration** — end-to-end with Weaviate test instance: import text, verify memories created with correct properties, verify relationships exist, verify parent summary content
- **Edge cases** — empty items array, single item with 1 chunk (no splitting needed), very large input (100+ chunks), item with no paragraph breaks

---

## Future Considerations

- **Semantic chunking**: Split on topic boundaries using HaikuClient for better retrieval quality
- **Deduplication**: Hash-based detection of duplicate imports
- **Batch Weaviate inserts**: `collection.data.insertMany()` for performance on large imports
- **Progress callbacks**: Streaming progress updates for consumers to show "Processing chunk 3 of 12..."
- **Format-aware splitting**: JSON-aware, XML-aware, Markdown-aware chunking strategies (consumer responsibility to pre-process, but core could offer adapters)
- **MCP tool**: `remember_import` tool in remember-mcp-server that calls ImportService directly

---

**Status**: Design Specification
**Recommendation**: Implement as part of remember-core. Add ImportService, unit tests, SVC SDK method. Consumer (agentbase.me) handles UX — file upload, oversized input detection, import modal, progress display.
**Related Documents**:
- agentbase.me/agent/design/local.large-message-import.md (consumer-side design)
- agentbase.me/agent/clarifications/clarification-24-large-message-chunking.md (requirements)
- agent/design/core-sdk.architecture.md (service layer pattern)
- agent/patterns/core-sdk.service-base.md (service conventions)
