# Task 161: byBroad Core Method

**Milestone**: M31 — byBroad & byRandom
**Status**: Not Started
**Estimated Hours**: 3-4

---

## Objective

Implement `byBroad()` on MemoryService — returns many memories with truncated content (head/mid/tail ~100 chars each) for scan-and-drill-in workflows. This enables browsing large result sets without overloading LLM context.

## Context

- **Design doc**: `agent/design/local.new-search-tools.md` — section "byBroad Mode"
- Does NOT follow standard sort-mode-method pattern (different response shape — truncated content)
- Default limit: 50 (much higher than normal modes which default to 10)
- Enables "scan and drill-in" workflow: browse broad results, then use `remember_search_memory` or `remember_query_memory` to get full content of interesting items

## TypeScript Interfaces

```typescript
interface BroadSearchResult {
  memory_id: string;
  title?: string;
  content_type: string;
  content_head: string;   // First ~100 chars
  content_mid: string;    // ~100 chars from middle
  content_tail: string;   // Last ~100 chars
  created_at: string;
  tags: string[];
  weight: number;
  // Include emotional composites for context
  total_significance?: number;
  feel_significance?: number;
  functional_significance?: number;
}

interface BroadModeRequest {
  user_id: string;
  query?: string;          // Optional search query for filtering
  sort_order?: 'asc' | 'desc';  // Default: desc by created_at
  limit?: number;          // Default: 50
  offset?: number;
  filters?: {
    types?: string[];
    exclude_types?: string[];
    tags?: string[];
    weight_min?: number;
    weight_max?: number;
    trust_min?: number;
    trust_max?: number;
    date_from?: string;
    date_to?: string;
    rating_min?: number;
    relationship_count_min?: number;
    relationship_count_max?: number;
    has_relationships?: boolean;
  };
  deleted_filter?: 'exclude' | 'include' | 'only';
}

interface BroadModeResult {
  results: BroadSearchResult[];
  total: number;
}
```

## Content Slicing Logic

```typescript
function sliceContent(content: string): { head: string; mid: string; tail: string } {
  const SLICE_SIZE = 100;

  if (content.length <= SLICE_SIZE * 3) {
    // Short content: return full content distributed across fields
    // For very short content (< 100), put it all in head
    if (content.length <= SLICE_SIZE) {
      return { head: content, mid: '', tail: '' };
    }
    // For medium content (100-200), split between head and tail
    if (content.length <= SLICE_SIZE * 2) {
      const midpoint = Math.floor(content.length / 2);
      return {
        head: content.slice(0, midpoint),
        mid: '',
        tail: content.slice(midpoint),
      };
    }
    // For content just under 300, do three even slices
    const third = Math.floor(content.length / 3);
    return {
      head: content.slice(0, third),
      mid: content.slice(third, third * 2),
      tail: content.slice(third * 2),
    };
  }

  // Long content: take slices from beginning, middle, and end
  const head = content.slice(0, SLICE_SIZE);
  const midStart = Math.floor(content.length / 2) - Math.floor(SLICE_SIZE / 2);
  const mid = content.slice(midStart, midStart + SLICE_SIZE);
  const tail = content.slice(-SLICE_SIZE);

  return { head, mid, tail };
}
```

## Steps

1. Define `BroadSearchResult`, `BroadModeRequest`, and `BroadModeResult` interfaces
2. Implement `sliceContent(content: string): { head, mid, tail }` — content truncation into head/mid/tail slices (~100 chars each)
3. Implement `MemoryService.byBroad(request: BroadModeRequest): Promise<BroadModeResult>` — fetch objects, truncate content, map to BroadSearchResult
4. Default limit: 50
5. Default sort_order: desc by created_at
6. Include metadata: memory_id, title, content_type, created_at, tags, weight
7. Include emotional composites if available: total_significance, feel_significance, functional_significance (undefined if not scored by REM)
8. Apply standard filter pipeline (ghost exclusion, trust filtering, deleted filtering)
9. Support optional query parameter for filtering within the broad scan
10. Handle edge cases for short content (< 300 chars) gracefully

## Verification

- [ ] Returns truncated content with head/mid/tail slices (~100 chars each)
- [ ] Default limit is 50
- [ ] Short content (< 100 chars) handled: all in head, mid and tail empty
- [ ] Medium content (100-200 chars) handled: split between head and tail
- [ ] Content just under 300 chars: three even slices
- [ ] Long content: head from start, mid from middle, tail from end
- [ ] Standard filters work (types, tags, weight, trust, date, deleted)
- [ ] sort_order parameter works (asc/desc by created_at)
- [ ] Emotional composites included when available, undefined when not
- [ ] Ghost memories excluded by default
- [ ] Tests colocated: appropriate `.spec.ts` file alongside implementation
