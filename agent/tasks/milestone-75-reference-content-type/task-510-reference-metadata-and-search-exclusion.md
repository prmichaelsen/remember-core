# Task 510: Reference Metadata & Search Exclusion

**Milestone**: M75 — Reference Content Type
**Status**: not_started
**Estimated Hours**: 1
**Dependencies**: None

---

## Objective

Update the `reference` content type metadata to reflect its new role as the type for bulk-ingested external content, and add it to the default search exclusion list.

## Context

The `reference` content type already exists in:
- `src/types/memory.types.ts` (ContentType union, line ~16)
- `src/constants/content-types.ts` (CONTENT_TYPES array, line ~16)

It currently has category `'core'` with description "Quick reference guides and cheat sheets". It needs to become a `'system'` type for ingested content, excluded from default searches like `'agent'`.

## Steps

### 1. Update CONTENT_TYPE_METADATA (`src/constants/content-types.ts`)

Change `reference` entry from:
```ts
reference: {
  name: 'reference',
  category: 'core',
  description: 'Quick reference guides and cheat sheets',
  examples: ['Command references', 'Keyboard shortcuts', 'API references', 'Cheat sheets'],
},
```

To:
```ts
reference: {
  name: 'reference',
  category: 'system',
  description: 'Bulk-ingested external content — crawled web pages, documentation, repos',
  examples: [
    'Crawled GitHub repo page',
    'Ingested documentation site page',
    'Imported wiki article',
    'Scraped blog post',
  ],
},
```

### 2. Update CONTENT_TYPE_CATEGORIES (`src/constants/content-types.ts`)

Move `'reference'` from `core` array to `system` array:
- Remove from: `core: ['code', 'note', 'documentation', 'reference']`
- Add to: `system: ['system', 'action', 'audit', 'history', 'ghost', 'agent', 'reference']`

### 3. Update DEFAULT_EXCLUDED_TYPES (`src/utils/filters.ts`)

Change:
```ts
const DEFAULT_EXCLUDED_TYPES = ['agent'];
```

To:
```ts
const DEFAULT_EXCLUDED_TYPES = ['agent', 'reference'];
```

### 4. Bump version and publish

- Bump patch version in `package.json`
- `npm publish`

## Verification

- [ ] `CONTENT_TYPE_METADATA.reference.category` is `'system'`
- [ ] `CONTENT_TYPE_METADATA.reference.description` mentions ingested/crawled content
- [ ] `CONTENT_TYPE_CATEGORIES.core` does NOT include `'reference'`
- [ ] `CONTENT_TYPE_CATEGORIES.system` includes `'reference'`
- [ ] `DEFAULT_EXCLUDED_TYPES` includes both `'agent'` and `'reference'`
- [ ] `npm test` passes
- [ ] New version published
