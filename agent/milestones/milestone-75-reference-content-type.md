# Milestone 75: Reference Content Type

**Status**: planned
**Estimated Duration**: 0.5 weeks
**Tasks**: 1
**Dependencies**: None

---

## Goal

Repurpose the existing `reference` content type for bulk-ingested external content (crawled websites, repos, wikis). Update its metadata category from `'core'` to `'system'` and exclude it from default search results — the same treatment `agent` content type receives.

## Context

The `agentbase_ingest` tool (designed in agentbase.me) will crawl websites and store pages as memories with `content_type: 'reference'`. These bulk-ingested memories should not pollute regular memory searches. The `reference` type already exists in the ContentType union and CONTENT_TYPES array, so no type changes are needed — only metadata and search filter updates.

## Deliverables

1. Updated `CONTENT_TYPE_METADATA.reference` — category `'system'`, description and examples reflecting ingested external content
2. Updated `DEFAULT_EXCLUDED_TYPES` — add `'reference'` alongside `'agent'`
3. Published npm release

## Success Criteria

- `reference` metadata category is `'system'`
- `reference` description reflects ingested/crawled content use case
- Default searches exclude `reference` content type
- Explicit `types: ['reference']` filter still returns reference memories
- All existing tests pass
- New version published to npm
