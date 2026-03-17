# Milestone 79: Query Augmentation Service

**Goal**: Add synthetic question generation to improve query-content matching via LLM-generated searchable questions stored alongside memories
**Duration**: 1 week
**Dependencies**: None (uses existing HaikuClient, MemoryService, Weaviate schema)
**Status**: Not Started

---

## Overview

Users search for content using natural language questions that may not match the exact words in their memories. A screenplay titled "The Lost Garden" won't match the query "what play did I write?" because it doesn't contain "play" or "wrote".

This milestone adds a background service that generates 3-5 synthetic questions each memory could answer, stores them in a `synthetic_queries` field, and makes them searchable. This is a proven RAG best practice that improves recall by 10-20% for edge cases.

**Pattern**: Fast background job (every 5-10 minutes) that auto-catches unprocessed memories. Optional sync mode for critical imports where users need immediate query support.

**Design**: Based on RAG best practices research (agent/artifacts/rag-best-practices-2025-2026.md) and audit findings (agent/reports/audit-1-ingestion-rem-data-massaging.md)

---

## Deliverables

### 1. Schema Changes
- `synthetic_queries` TEXT[] field on Memory type (Weaviate + TypeScript)
- `queries_generated_at` TEXT field (ISO timestamp or NULL)
- `queries_generation_status` TEXT field ('pending' | 'generated' | 'failed' | 'skipped')
- Update `ALL_MEMORY_PROPERTIES` constant

### 2. QueryAugmenterService
- `QueryAugmenterService` class with `generateQueries(memory)` method
- Haiku prompt engineering for question generation
- Batch processing support (100 memories per call)
- Error handling and retry logic
- Unit tests (colocated)

### 3. Background Job (remember-query-augmenter)
- Scheduler: Enumerate collections, query unprocessed memories (WHERE queries_generated_at IS NULL)
- Worker: Generate queries via Haiku, update memories with results
- Frequency: Every 5-10 minutes (configurable)
- Batch size: 100 memories per collection per run
- GCP Cloud Scheduler + Cloud Run Job deployment
- Firestore cursor tracking (optional, for large backlogs)

### 4. Search Integration
- Update MemoryService.search() to include `synthetic_queries` in Weaviate query
- Update SpaceService.search() similarly
- Test that hybrid search (M78, if implemented) includes synthetic_queries

### 5. Import Integration (Optional Sync Mode)
- Add `generate_queries?: 'async' | 'sync' | 'skip'` to ImportInput
- Default: 'async' (background job catches it)
- 'sync': Block import until queries generated (for critical imports)
- 'skip': Mark as skipped, background job ignores

### 6. Backfill Script
- One-time script to process existing memories
- Progress tracking and resume support
- Cost estimation reporting

---

## Success Criteria

- [ ] `synthetic_queries`, `queries_generated_at`, `queries_generation_status` fields exist on Memory type and Weaviate schema
- [ ] QueryAugmenterService.generateQueries() returns 3-5 relevant questions via Haiku
- [ ] Background job processes 100 unprocessed memories per collection per 5-min run
- [ ] Newly imported memories get queries within 5-10 minutes
- [ ] Search includes synthetic_queries in Weaviate query properties
- [ ] Sync mode blocks import until queries generated (if requested)
- [ ] Skip mode prevents background processing (if requested)
- [ ] Edge case query "what play did I write?" matches screenplay content
- [ ] Unit tests pass for QueryAugmenterService
- [ ] Backfill script processes existing memories without errors
- [ ] Cost tracking: ~$0.0002 per memory processed
- [ ] All existing tests continue to pass

---

## Architecture

### Schema
```typescript
interface Memory {
  // ... existing fields ...
  synthetic_queries?: string[];      // ["What screenplay did I write?", ...]
  queries_generated_at?: string;     // ISO timestamp or NULL
  queries_generation_status?: 'pending' | 'generated' | 'failed' | 'skipped';
}
```

### Haiku Prompt
```typescript
const prompt = `Generate 3-5 natural questions this content could answer.
Focus on how a user would search for this information.
Return as JSON array of strings.

Content:
${memory.content.substring(0, 2000)}

Example output:
["What screenplay did I write?", "Where is my script about gardens?", "What was that play set in a lost garden?"]`;
```

### Background Job Flow
```
Cloud Scheduler (every 5 min)
  → Enumerate collections
  → For each collection:
      Query WHERE queries_generated_at IS NULL LIMIT 100
      → Generate queries via Haiku (batch)
      → Update memories with synthetic_queries
      → Track cursor (if batch incomplete)
```

### Search Integration
```typescript
// MemoryService.search()
collection.query.nearText(query, {
  properties: ['content', 'synthetic_queries'],  // Search both
})

// Or hybrid search (M78)
collection.query.hybrid(query, {
  alpha: 0.5,
  properties: ['content', 'synthetic_queries'],
})
```

---

## Key Files to Create

```
remember-query-augmenter/
├── src/
│   ├── index.ts                  # Entry point (scheduler vs worker mode)
│   ├── scheduler.ts              # Enumerate collections, query unprocessed
│   ├── worker.ts                 # Generate queries, update memories
│   └── config/
│       └── config.service.ts     # Config loading (MODE, batch size, schedule)
├── scripts/
│   ├── deploy.ts                 # GCP deployment script
│   └── backfill.ts               # One-time backfill for existing memories
├── package.json
├── tsconfig.json
└── cloudbuild.yaml               # Cloud Build config

src/services/
├── query-augmenter.service.ts    # QueryAugmenterService class
└── query-augmenter.service.spec.ts

src/types/
└── memory.types.ts               # Add synthetic_queries fields
```

---

## Key Files to Modify

```
src/services/memory.service.ts
  - Update search() to include synthetic_queries in Weaviate query properties

src/services/space.service.ts
  - Update search() similarly

src/services/import.service.ts
  - Add generate_queries parameter to ImportInput
  - Implement sync/skip modes

src/database/weaviate/schema.ts
  - Add synthetic_queries, queries_generated_at, queries_generation_status properties

docs/openapi.yaml
  - Add generate_queries parameter to import endpoint schema
```

---

## Configuration

```typescript
// remember-query-augmenter config
export const QUERY_AUGMENTER_CONFIG = {
  schedule: '*/5 * * * *',       // Every 5 minutes
  batch_size: 100,                // Memories per collection per run
  stale_threshold_days: 30,       // Regenerate queries older than 30 days
  min_content_length: 50,         // Skip very short memories
  max_queries_per_memory: 5,      // Limit questions generated
};

// ImportService config
export interface ImportInput {
  items: ImportItem[];
  chunk_size?: number;
  generate_queries?: 'async' | 'sync' | 'skip';  // Default: 'async'
  context_conversation_id?: string;
}
```

---

## Cost Analysis

**Haiku pricing**: ~$0.25 per 1M input tokens, $1.25 per 1M output tokens

**Per memory**:
- Input: ~500 tokens (content sample)
- Output: ~50 tokens (3-5 questions)
- **Cost**: ~$0.0002 per memory

**Scenarios**:
- First run (10,000 memories backfill): 10,000 × $0.0002 = **$2 total**
- Ongoing (500 new memories per day): 500 × $0.0002 = **$0.10/day** = **$3/month**

**Very cheap.** Most scheduler runs find zero unprocessed memories (no cost).

---

## Performance

**Latency for new imports**:
- Vector embedding: Immediate (part of Weaviate insert)
- Synthetic queries: **5-10 minutes** (next scheduler run)

**User impact**: Core search works immediately via vector similarity. Synthetic queries improve recall by 10-20% for edge cases within 5-10 minutes.

**Processing rate**:
- 100 memories per collection per 5-min run
- 1,200 memories per collection per hour
- Scales to thousands of collections

---

## Testing Strategy

### Unit Tests (QueryAugmenterService)
- Valid content → 3-5 relevant questions
- Short content (<50 chars) → skip or error handling
- Haiku timeout → retry logic
- Haiku invalid JSON → fallback to empty array

### Integration Tests (remember-query-augmenter)
- Scheduler enumerates collections correctly
- Worker processes batch of 100 memories
- Memories updated with synthetic_queries field
- Cursor advances for large backlogs

### E2E Tests
- Import memory → wait 5-10 min → verify queries_generated_at NOT NULL
- Search with edge case query → verify synthetic_queries matched
- Sync mode import → verify queries generated before return
- Skip mode import → verify queries_generation_status = 'skipped'

### Backfill Tests
- Process 1,000 test memories
- Verify all queries_generated_at timestamps
- Verify cost tracking accurate

---

## Deployment

### GCP Resources
- Cloud Scheduler Job: `query-augmenter-scheduler` (every 5 min)
- Cloud Run Job: `query-augmenter-worker` (triggered by scheduler)
- Service Account: Reuse existing remember-rem service account
- IAM: roles/run.invoker on worker job

### Deploy Script
```bash
# From remember-query-augmenter/
npm run deploy

# Or manual:
gcloud builds submit --config=cloudbuild.yaml
gcloud scheduler jobs create http query-augmenter-scheduler \
  --schedule="*/5 * * * *" \
  --uri="https://us-central1-run.googleapis.com/.../query-augmenter-worker:run" \
  --http-method=POST \
  --location=us-central1
```

---

## Migration Path

1. **Schema migration**: Add synthetic_queries fields to Memory type (remember-core)
2. **Deploy QueryAugmenterService**: Implement and test service (remember-core)
3. **Deploy background job**: Build and deploy remember-query-augmenter (GCP)
4. **Backfill existing memories**: Run backfill script (one-time)
5. **Update search**: Integrate synthetic_queries into MemoryService.search()
6. **Monitor costs**: Track Haiku usage for first week
7. **Tune batch size**: Adjust if processing too slow or too expensive

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Generated questions irrelevant | Prompt engineering, Haiku examples, quality sampling |
| Haiku timeouts | Retry logic, batch processing, timeout tracking |
| Cost overruns | Batch size limits, cost cap monitoring, skip very short content |
| Stale queries (content changes) | Regenerate queries >30 days old, version tracking |
| Search doesn't use synthetic_queries | Integration tests, verify Weaviate query properties |
| Sync mode slows imports | Default to async, sync is opt-in only |

---

## Future Enhancements

- **Query quality scoring**: Track which synthetic queries lead to successful matches, feedback loop
- **User-provided questions**: Allow users to add their own searchable questions
- **Multi-language support**: Generate questions in user's preferred language
- **Question templates**: Domain-specific templates (e.g., recipes, code, journal entries)
- **Negative questions**: "What is this NOT about?" for exclusion matching

---

## Related Work

- **M14 (Import Service)**: Where memories are created (this augments them)
- **M78 (Search Enhancement)**: Request-time optimization (re-ranking, hybrid search) — complementary to M79
- **REM Service**: Background relationship discovery — different concern, runs hourly
- **RAG Best Practices Research**: agent/artifacts/rag-best-practices-2025-2026.md

---

**Status**: Not Started
**Priority**: Medium-High (10-20% recall improvement for edge cases)
**Estimated Cost**: $3-5/month ongoing
**Estimated Latency**: 5-10 minutes for new imports
**Deployment**: GCP Cloud Scheduler + Cloud Run Job (similar to remember-rem)

---

## Tasks

| ID | Name | Est. Hours | Dependencies |
|----|------|-----------|-------------|
| task-523 | Schema: Add synthetic_queries fields to Memory type | 2 | None |
| task-524 | QueryAugmenterService + Haiku integration + tests | 6 | task-523 |
| task-525 | remember-query-augmenter scheduler + worker | 8 | task-524 |
| task-526 | Search integration (MemoryService + SpaceService) | 3 | task-523 |
| task-527 | Import sync/skip modes | 4 | task-524 |
| task-528 | Backfill script + deployment | 4 | task-525 |
| task-529 | E2E tests + cost tracking | 3 | task-526, task-527 |

**Total estimated**: 30 hours (~1 week)
