# New MCP Tools: Search Modes, Ghost Memory, Emotional Dimensions & Mood

**Concept**: Comprehensive expansion of remember-mcp tools — unified search modes, ghost memory suite, emotional weighting exposure, core mood introspection, memory classification, and user perception
**Created**: 2026-03-07
**Last Updated**: 2026-03-07
**Status**: Proposal

---

## Overview

This design synthesizes three interconnected feature areas into a single unified plan for remember-mcp's next major tool expansion. All underlying service logic is built in remember-core; remember-mcp's job is to define MCP tool interfaces (descriptions, input schemas, handlers) that expose these capabilities.

### Feature Areas

1. **Search Modes (`remember_search_by`)** — A unified search tool exposing multiple sort/discovery modes: byTime, byDensity, byRating, byDiscovery, byProperty, bySignificance, byBroad, byRandom
2. **Ghost Memory Tools** — Dedicated tool suite for creating and searching ghost memories with hardcoded content_type and tags
3. **Emotional Weighting & Mood** — Expose remember-core's 31 emotional dimensions, composite significance scores, core mood state, user perception, and memory classification system

### Source Documents Synthesized

- `agent/drafts/new-tools.md` — Original brainstorm
- `agent/design/core-mood-memory.md` (remember-mcp) — Core mood state, retrieval bias, user perception, classification
- `remember-core/agent/design/local.rem-emotional-weighting.md` — 31 emotional dimensions, REM scoring, composites, byProperty sort

---

## Problem Statement

- **Search modes**: remember-core supports `byTime`, `byDensity`, `byRating`, `byDiscovery`, `byProperty`, and slice variants, but none are exposed as MCP tools. Users can only use `remember_search_memory` (hybrid) and `remember_find_similar` (vector).
- **Broad search**: No way to fetch large result sets without overloading LLM context. Users need a "scan and drill-in" workflow.
- **Random sampling**: No serendipity mechanism — users can't discover forgotten memories randomly.
- **Ghost memories**: Creating ghost memories requires knowing the correct `content_type` and tags. A dedicated tool suite would eliminate errors and simplify the ghost workflow.
- **Rating**: remember-core has a full `RatingService` (1-5 stars, Bayesian averaging) but remember-mcp doesn't expose it. Rating is social (for published space memories), not personal (personal importance = `weight`).
- **Missing filters**: `rating_min`, `relationship_count_min/max` filters exist in core but aren't in MCP tool schemas.
- **Emotional dimensions not exposed**: remember-core stores 31 `feel_*` dimensions per memory (scored by REM/Haiku), 3 composite significance scores, and `rem_touched_at`/`rem_visits` metadata — none are queryable or sortable from MCP tools.
- **No mood introspection**: The core mood memory (`users/{user_id}/core/mood`) stores the ghost's emotional state (6 dimensions, pressures, motivation/goal/purpose, dominant_emotion, color) but no MCP tool can read or influence it.
- **No user perception access**: The ghost's model of each user (`users/{owner_id}/core/perceptions/{target_user_id}`) — personality sketch, communication style, interests, patterns, needs — is invisible to MCP tools.
- **No classification access**: REM's memory classification system (genres, thematic groups, quality signals, deduplication) has no MCP exposure. Users can't browse by genre or review quality flags.
- **No `feel_*` create-time defaults**: `remember_create_memory` doesn't accept optional emotional dimension fields that the creating LLM could provide as sane defaults before REM re-scores.

---

## Solution

### Tool 1: `remember_search_by`

A single MCP tool with a `mode` parameter that dispatches to the appropriate core service method.

#### Modes

| Mode | Core Method | Description | Status in Core |
|------|-------------|-------------|----------------|
| `byTime` | `MemoryService.byTime()` | Chronological sort (asc/desc) | Exists |
| `byDensity` | `MemoryService.byDensity()` | Sort by relationship count | Exists |
| `byRating` | `MemoryService.byRating()` | Sort by Bayesian rating average | Exists |
| `byDiscovery` | `MemoryService.byDiscovery()` | Interleaved rated (4:1) + unrated | Exists |
| `byProperty` | `MemoryService.byProperty()` | Sort by any Weaviate property | Exists (emotional weighting design) |
| `bySignificance` | Shorthand for `byProperty` on `total_significance` | Sort by combined emotional + functional significance | Exists (composite score) |
| `byRandom` | TBD | Random sampling from collection | **Needs core implementation** |
| `byBroad` | TBD | Massive results with truncated content | **Needs core implementation** |
| `byRecommendation` | TBD | Personalized recommendations | **Needs core implementation** |

#### Parameters

```typescript
{
  name: 'remember_search_by',
  description: `Search memories using specialized modes beyond hybrid search.

  Modes:
  - byTime: Chronological sort (newest/oldest first)
  - byDensity: Sort by relationship count (most connected memories)
  - byRating: Sort by Bayesian rating average (social ratings from spaces)
  - byDiscovery: Interleaved rated + unrated content for exploration
  - byProperty: Sort by any memory property (e.g., feel_trauma, weight, feel_salience)
  - bySignificance: Sort by total_significance (combined emotional + functional score from REM)
  - byRandom: Random sampling for serendipitous rediscovery
  - byBroad: Massive results with truncated content for scan-and-drill-in workflow

  Use remember_search_memory for hybrid semantic+keyword search.
  Use remember_find_similar for vector similarity.
  Use this tool for structured browsing, sorting, and discovery.`,
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['byTime', 'byDensity', 'byRating', 'byDiscovery', 'byProperty', 'bySignificance', 'byRandom', 'byBroad'],
        description: 'Search mode to use'
      },
      query: {
        type: 'string',
        description: 'Optional search query (used within mode for filtering)'
      },
      // Mode-specific parameters
      sort_order: {
        type: 'string',
        enum: ['asc', 'desc'],
        description: 'Sort order (byTime, byDensity, byRating, byProperty, bySignificance). Default: desc'
      },
      sort_field: {
        type: 'string',
        description: 'Property to sort by (byProperty mode only). Any Weaviate property name, e.g. "feel_trauma", "feel_salience", "weight", "total_significance", "feel_coherence_tension"'
      },
      // Common parameters
      limit: { type: 'number', description: 'Max results. Default: 10 (byBroad default: 50)' },
      offset: { type: 'number', description: 'Pagination offset' },
      filters: {
        type: 'object',
        description: 'Standard search filters (types, exclude_types, tags, weight, trust, date, rating_min, relationship_count_min, relationship_count_max, etc.)',
        properties: {
          types: { type: 'array', items: { type: 'string' }, description: 'Include specific content types' },
          exclude_types: { type: 'array', items: { type: 'string' }, description: 'Exclude specific content types' },
          tags: { type: 'array', items: { type: 'string' } },
          weight_min: { type: 'number' },
          weight_max: { type: 'number' },
          trust_min: { type: 'number' },
          trust_max: { type: 'number' },
          date_from: { type: 'string', description: 'ISO 8601' },
          date_to: { type: 'string', description: 'ISO 8601' },
          rating_min: { type: 'number', description: 'Minimum Bayesian rating' },
          relationship_count_min: { type: 'number' },
          relationship_count_max: { type: 'number' },
          has_relationships: { type: 'boolean' }
        }
      },
      deleted_filter: {
        type: 'string',
        enum: ['exclude', 'include', 'only'],
        description: 'Default: exclude'
      }
    },
    required: ['mode']
  }
}
```

#### `byProperty` Mode — Generic Property Sort

Sort by any Weaviate property. Primary use case is sorting by emotional dimensions and functional signals from REM scoring.

```typescript
// Most emotionally significant memories
{ mode: 'byProperty', sort_field: 'total_significance', sort_order: 'desc' }

// Highest coherence tension (conflicting beliefs needing reconciliation)
{ mode: 'byProperty', sort_field: 'feel_coherence_tension', sort_order: 'desc' }

// Most novel memories
{ mode: 'byProperty', sort_field: 'feel_novelty', sort_order: 'desc' }

// Most traumatic memories
{ mode: 'byProperty', sort_field: 'feel_trauma', sort_order: 'desc' }

// Most humorous memories
{ mode: 'byProperty', sort_field: 'feel_humor', sort_order: 'desc' }

// Highest retrieval utility (most likely to be useful in future queries)
{ mode: 'byProperty', sort_field: 'feel_retrieval_utility', sort_order: 'desc' }

// Least visited by REM (candidates for scoring attention)
{ mode: 'byProperty', sort_field: 'rem_visits', sort_order: 'asc' }
```

#### `bySignificance` Mode — Composite Significance Sort

Shorthand for `byProperty` on `total_significance`. Combines emotional significance (Layer 1: 21 discrete emotions) and functional significance (Layer 2: 10 functional signals) into a single ranking.

```typescript
// Equivalent calls:
{ mode: 'bySignificance', sort_order: 'desc' }
{ mode: 'byProperty', sort_field: 'total_significance', sort_order: 'desc' }
```

Three composite scores available via `byProperty`:
- `feel_significance` — Weighted sum of Layer 1 discrete emotions
- `functional_significance` — Weighted sum of Layer 2 functional signals
- `total_significance` — Combined (`feel_significance` + `functional_significance`)

#### `byBroad` Mode — Truncated Content Response

Fetches a large number of results but returns truncated content to avoid context overload:

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
```

- Default limit: 50-100 (much higher than normal modes)
- Enables "scan and drill-in" workflow: browse broad results, then use `remember_search_memory` or `remember_query_memory` to get full content of interesting items
- **Needs new core method**: `MemoryService.byBroad()` or a `format: 'broad'` option on existing search

#### `byRandom` Mode — Random Sampling

- Fetches random memories from the user's collection
- Optional `query` parameter to constrain the random pool (e.g., random memories tagged "idea")
- **Needs new core method**: Could use Weaviate's `near_random` or a client-side shuffle approach
- Useful for serendipitous rediscovery of forgotten content

---

### Rating — Space-Only (Social Ratings)

Rating is a **social** feature for published memories in spaces, not for personal memories. Personal importance is already covered by the `weight` parameter (0-1).

Rating should be exposed on space tools (e.g., a future action on `remember_search_space` results or a dedicated space interaction), not on `remember_update_memory`. The `RatingService.rate()` in remember-core manages Bayesian averaging (`rating_count`, `rating_sum`, `rating_bayesian`) for published content.

Ghost tools do not need rating — ghosts are read-only accessors.

`byRating` and `byDiscovery` modes on `remember_search_by` work against personal memories using whatever ratings exist (initially empty). These modes are more immediately useful on a future `remember_search_space_by` where social ratings are populated.

---

### Tool 2: `remember_create_memory` — Schema Enhancement

Extend the existing `remember_create_memory` input schema with optional `feel_*` fields. The creating LLM can provide sane defaults at creation time. REM always re-scores during its cycle regardless.

```typescript
// Added to remember_create_memory inputSchema.properties:

// Layer 1: Discrete Emotions (all optional, 0-1 floats)
feel_emotional_significance: { type: 'number', minimum: 0, maximum: 1 },
feel_vulnerability: { type: 'number', minimum: 0, maximum: 1 },
feel_trauma: { type: 'number', minimum: 0, maximum: 1 },
feel_humor: { type: 'number', minimum: 0, maximum: 1 },
feel_happiness: { type: 'number', minimum: 0, maximum: 1 },
feel_sadness: { type: 'number', minimum: 0, maximum: 1 },
feel_fear: { type: 'number', minimum: 0, maximum: 1 },
feel_anger: { type: 'number', minimum: 0, maximum: 1 },
feel_surprise: { type: 'number', minimum: 0, maximum: 1 },
feel_disgust: { type: 'number', minimum: 0, maximum: 1 },
feel_contempt: { type: 'number', minimum: 0, maximum: 1 },
feel_embarrassment: { type: 'number', minimum: 0, maximum: 1 },
feel_shame: { type: 'number', minimum: 0, maximum: 1 },
feel_guilt: { type: 'number', minimum: 0, maximum: 1 },
feel_excitement: { type: 'number', minimum: 0, maximum: 1 },
feel_pride: { type: 'number', minimum: 0, maximum: 1 },
feel_valence: { type: 'number', minimum: -1, maximum: 1 },  // Note: -1 to 1
feel_arousal: { type: 'number', minimum: 0, maximum: 1 },
feel_dominance: { type: 'number', minimum: 0, maximum: 1 },
feel_intensity: { type: 'number', minimum: 0, maximum: 1 },
feel_coherence_tension: { type: 'number', minimum: 0, maximum: 1 },

// Layer 2: Functional Signals (all optional, 0-1 floats)
feel_salience: { type: 'number', minimum: 0, maximum: 1 },
feel_urgency: { type: 'number', minimum: 0, maximum: 1 },
feel_social_weight: { type: 'number', minimum: 0, maximum: 1 },
feel_agency: { type: 'number', minimum: 0, maximum: 1 },
feel_novelty: { type: 'number', minimum: 0, maximum: 1 },
feel_retrieval_utility: { type: 'number', minimum: 0, maximum: 1 },
feel_narrative_importance: { type: 'number', minimum: 0, maximum: 1 },
feel_aesthetic_quality: { type: 'number', minimum: 0, maximum: 1 },
```

These are **optional create-time defaults**. REM re-scores authoritatively during its cycle. The LLM description should make clear these are hints, not permanent values.

---

### Tool 3: `remember_get_mood`

Read the ghost's current core mood state. Enables introspection — the ghost can explain how it feels and why.

```typescript
{
  name: 'remember_get_mood',
  description: `Get the ghost's current emotional state (core mood memory).

  Returns the ghost's current dimensional state (valence, arousal, confidence,
  social_warmth, coherence, trust), derived emotion labels (dominant_emotion, color),
  directional state (motivation, goal, purpose), and active pressure sources.

  Use this for introspection — understanding how the ghost feels and why.
  The mood state biases memory retrieval and influences ghost behavior.`,
  inputSchema: {
    type: 'object',
    properties: {
      include_pressures: {
        type: 'boolean',
        description: 'Include active pressure sources with reasons. Default: true'
      },
      include_perception: {
        type: 'string',
        description: 'Include the ghost\'s perception of a specific user (by user_id). Omit to skip.'
      }
    }
  }
}
```

**Returns**:

```typescript
interface GetMoodResult {
  state: {
    valence: number;        // -1 to 1
    arousal: number;        // 0 to 1
    confidence: number;     // 0 to 1
    social_warmth: number;  // 0 to 1
    coherence: number;      // 0 to 1
    trust: number;          // 0 to 1
  };
  color: string;              // e.g. "cautiously optimistic"
  dominant_emotion: string;   // e.g. "curious wariness"
  reasoning: string;          // Why this emotion fits
  motivation: string;         // Current behavioral driver
  goal: string;               // Active goal
  purpose: string;            // Enduring purpose
  pressures?: Pressure[];     // Active pressure sources
  perception?: UserPerception; // Ghost's model of specified user
  last_updated: string;
  rem_cycles_since_shift: number;
}
```

**Privacy**: Mood data is private to the owner. Ghost accessors cannot read another user's mood state.

---

### Tool 4: `remember_get_perception`

Read the ghost's model of a specific user.

```typescript
{
  name: 'remember_get_perception',
  description: `Get the ghost's internal model of a user (personality, communication style,
  interests, patterns, needs). The ghost builds this model over time from interactions.

  Use this to understand how the ghost perceives someone, or to review and correct the model.
  The ghost's perception influences how it calibrates mood responses and communication.`,
  inputSchema: {
    type: 'object',
    properties: {
      target_user_id: {
        type: 'string',
        description: 'User ID to get perception for. Omit to get self-perception (ghost\'s model of its owner).'
      }
    }
  }
}
```

**Returns**:

```typescript
interface GetPerceptionResult {
  owner_id: string;
  target_user_id: string;
  personality_sketch: string;
  communication_style: string;
  emotional_baseline: string;
  interests: string[];
  patterns: string[];
  needs: string[];
  evolution_notes: string[];
  confidence_level: number;
  last_updated: string;
}
```

---

### Tool 5: `remember_get_classifications`

Browse the memory classification index built by REM.

```typescript
{
  name: 'remember_get_classifications',
  description: `Browse the ghost's memory classification system. REM automatically classifies
  memories by genre/format, quality, and thematic group during consolidation cycles.

  Use this to:
  - Browse memories by genre ("show me all my short stories")
  - Review quality flags ("what does the ghost think is low-value?")
  - Explore thematic groups ("what topics do I write about most?")
  - Find duplicates or stale content
  - Get unclassified count for REM progress tracking`,
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['genres', 'thematic_groups', 'quality', 'all'],
        description: 'Which classification category to retrieve. Default: all'
      },
      genre: {
        type: 'string',
        description: 'Filter to a specific genre (e.g., "short_story", "standup_bit", "poem"). Returns memory IDs in that genre.'
      },
      quality: {
        type: 'string',
        enum: ['substantive', 'draft', 'low_value', 'duplicate', 'stale'],
        description: 'Filter to a specific quality signal. Returns memory IDs with that flag.'
      },
      thematic_group: {
        type: 'string',
        description: 'Filter to a specific thematic group (e.g., "music-production"). Returns memory IDs in that group.'
      }
    }
  }
}
```

**Returns**:

```typescript
interface GetClassificationsResult {
  // When category is 'all' or 'genres':
  genres?: Record<string, string[]>;      // genre -> memory_ids
  // When category is 'all' or 'thematic_groups':
  thematic_groups?: Record<string, string[]>; // group -> memory_ids
  // When category is 'all' or 'quality':
  quality?: Record<string, string[]>;     // quality_signal -> memory_ids
  // Always:
  unclassified_count: number;
  last_updated: string;
}
```

---

### Tools 6-10: Ghost Memory Tools

Dedicated tools for ghost memory operations with hardcoded `content_type: 'ghost'` and ghost-specific tags.

#### Tool 6: `remember_create_ghost_memory`

```typescript
{
  name: 'remember_create_ghost_memory',
  description: `Create a ghost memory (cross-user interaction record).

  Ghost memories track what happened during ghost conversations — observations,
  impressions, and insights about the accessor. Automatically sets content_type
  to 'ghost' and adds ghost-specific tags.

  Ghost memories are excluded from default searches. They are only visible when
  explicitly searching with content_type: 'ghost' or using ghost memory tools.`,
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Ghost memory content' },
      title: { type: 'string', description: 'Optional title' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Additional tags (ghost-specific tags added automatically)' },
      weight: { type: 'number', minimum: 0, maximum: 1, description: 'Significance (0-1)' },
      trust: { type: 'number', minimum: 0, maximum: 1, description: 'Trust level (0-1)' },
      // Optional feel_* fields (same as remember_create_memory)
      feel_salience: { type: 'number', minimum: 0, maximum: 1 },
      feel_social_weight: { type: 'number', minimum: 0, maximum: 1 },
      feel_narrative_importance: { type: 'number', minimum: 0, maximum: 1 }
    },
    required: ['content']
  }
}
```

Handler hardcodes:
- `content_type: 'ghost'`
- Adds tags: `ghost`, `ghost:{accessor_user_id}` (from auth context)

#### Tool 7: `remember_update_ghost_memory`

Same as `remember_update_memory` but validates the memory has `content_type: 'ghost'` before allowing updates. Rejects updates to non-ghost memories.

```typescript
{
  name: 'remember_update_ghost_memory',
  description: 'Update a ghost memory. Only works on memories with content_type: ghost.',
  inputSchema: {
    type: 'object',
    properties: {
      memory_id: { type: 'string', description: 'Ghost memory ID to update' },
      content: { type: 'string' },
      title: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
      weight: { type: 'number', minimum: 0, maximum: 1 },
      trust: { type: 'number', minimum: 0, maximum: 1 }
    },
    required: ['memory_id']
  }
}
```

#### Tool 8: `remember_search_ghost_memory`

Wraps `remember_search_memory` with `filters.types: ['ghost']` hardcoded.

```typescript
{
  name: 'remember_search_ghost_memory',
  description: `Search ghost memories using hybrid semantic + keyword search.
  Automatically filters to content_type: ghost. Use this to find specific
  ghost interaction records.`,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      alpha: { type: 'number', minimum: 0, maximum: 1, description: 'Semantic vs keyword balance. Default: 0.7' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags' },
      limit: { type: 'number', description: 'Max results. Default: 10' },
      offset: { type: 'number' },
      deleted_filter: { type: 'string', enum: ['exclude', 'include', 'only'] }
    },
    required: ['query']
  }
}
```

#### Tool 9: `remember_query_ghost_memory`

Wraps `remember_query_memory` with `filters.types: ['ghost']` hardcoded.

```typescript
{
  name: 'remember_query_ghost_memory',
  description: `Query ghost memories using natural language (pure semantic search).
  Automatically filters to content_type: ghost.`,
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language question' },
      limit: { type: 'number', description: 'Max results. Default: 5' },
      min_relevance: { type: 'number', description: 'Minimum relevance score. Default: 0.6' }
    },
    required: ['query']
  }
}
```

#### Tool 10: `remember_search_ghost_memory_by`

Wraps `remember_search_by` with `filters.types: ['ghost']` hardcoded. All modes available.

```typescript
{
  name: 'remember_search_ghost_memory_by',
  description: `Search ghost memories using specialized modes (byTime, byDensity,
  byProperty, byBroad, etc.). Automatically filters to content_type: ghost.`,
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['byTime', 'byDensity', 'byRating', 'byDiscovery', 'byProperty', 'bySignificance', 'byRandom', 'byBroad'],
        description: 'Search mode'
      },
      query: { type: 'string', description: 'Optional search query' },
      sort_order: { type: 'string', enum: ['asc', 'desc'] },
      sort_field: { type: 'string', description: 'Property to sort by (byProperty mode)' },
      limit: { type: 'number' },
      offset: { type: 'number' },
      deleted_filter: { type: 'string', enum: ['exclude', 'include', 'only'] }
    },
    required: ['mode']
  }
}
```

---

### Schema Updates for Existing Tools

Update existing tool input schemas to expose new core filters and emotional dimensions:

#### New Filters on Existing Search Tools

| Filter | Core Support | Add To |
|--------|-------------|--------|
| `rating_min` | Yes | search_memory, find_similar, query_memory, search_space |
| `relationship_count_min` | Yes | search_memory, find_similar |
| `relationship_count_max` | Yes | search_memory, find_similar |
| `exclude_types` | Yes | search_memory, search_space |

#### Emotional Dimensions on `remember_create_memory`

All 31 `feel_*` fields added as optional parameters (see Tool 2 above). Also add to `remember_update_memory` for manual corrections.

#### Emotional Context in Search Results

When memories have been scored by REM, search results should include composite scores:

```typescript
// Added to search result memory objects:
{
  // ... existing fields ...
  total_significance?: number;
  feel_significance?: number;
  functional_significance?: number;
  rem_touched_at?: string;
  rem_visits?: number;
}
```

---

### Tool 11: `remember_search_space_by`

Space-specific variant of `remember_search_by`. Wraps `SpaceService.byDiscovery()` and future space sort modes.

```typescript
{
  name: 'remember_search_space_by',
  description: `Search shared spaces using specialized modes. Similar to remember_search_by
  but operates on published memories in spaces and groups.`,
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['byTime', 'byRating', 'byDiscovery', 'byProperty', 'byBroad', 'byRandom'],
        description: 'Search mode'
      },
      spaces: { type: 'array', items: { type: 'string' }, description: 'Space names to search' },
      groups: { type: 'array', items: { type: 'string' }, description: 'Group IDs to search' },
      query: { type: 'string' },
      sort_order: { type: 'string', enum: ['asc', 'desc'] },
      sort_field: { type: 'string', description: 'Property to sort by (byProperty mode)' },
      limit: { type: 'number' },
      offset: { type: 'number' },
      moderation_filter: { type: 'string' },
      include_comments: { type: 'boolean' }
    },
    required: ['mode']
  }
}
```

---

## REM Emotional Dimensions Reference

For LLM tool description context, here are all 31 dimensions and 3 composites that can be used with `byProperty`:

### Layer 1: Discrete Emotions (21 dimensions, `feel_` prefix, 0-1 float)

| Property | Category | Description |
|----------|----------|-------------|
| `feel_emotional_significance` | Meta | Overall emotional weight |
| `feel_vulnerability` | Meta | Personal exposure/openness |
| `feel_trauma` | Meta | Negative formative experience intensity |
| `feel_humor` | Positive | Comedic/playful quality |
| `feel_happiness` | Core | Positive affect / joy |
| `feel_sadness` | Core | Negative affect / grief / loss |
| `feel_fear` | Core | Threat perception / anxiety |
| `feel_anger` | Core | Frustration / injustice |
| `feel_surprise` | Core | Unexpectedness / novelty |
| `feel_disgust` | Core | Aversion / rejection |
| `feel_contempt` | Core | Superiority / dismissal |
| `feel_embarrassment` | Self-conscious | Social discomfort |
| `feel_shame` | Self-conscious | Deep self-judgment |
| `feel_guilt` | Self-conscious | Responsibility for harm |
| `feel_excitement` | Positive | Anticipatory positive arousal |
| `feel_pride` | Positive | Accomplishment / self-evaluation |
| `feel_valence` | VAD | Positive-negative spectrum (-1 to 1) |
| `feel_arousal` | VAD | Calm to excited |
| `feel_dominance` | VAD | Control vs submission |
| `feel_intensity` | Dimensional | Overall emotional magnitude |
| `feel_coherence_tension` | Cognitive | Conflict with existing beliefs |

### Layer 2: Functional Signals (10 dimensions, `feel_` prefix, 0-1 float)

| Property | Biological Analog | Function |
|----------|-------------------|----------|
| `feel_salience` | Fear/Surprise | How unexpected/novel (prediction error) |
| `feel_urgency` | Anger/Fear | Time-sensitivity of relevance (decay rate) |
| `feel_social_weight` | Trust/Disgust | Relationship/reputation impact |
| `feel_agency` | Pride/Shame | Caused by the bot's own actions? |
| `feel_novelty` | — | Uniqueness relative to collection |
| `feel_retrieval_utility` | — | Likelihood of future usefulness |
| `feel_narrative_importance` | — | Advances/anchors a personal story arc |
| `feel_aesthetic_quality` | — | Beauty, craft, artistry |
| `feel_valence` | (shared) | Scored independently in functional context |
| `feel_coherence_tension` | (shared) | Scored independently in functional context |

### Composites (3, computed by REM)

| Property | Inputs | Purpose |
|----------|--------|---------|
| `feel_significance` | Weighted sum of Layer 1 | Emotional intensity composite |
| `functional_significance` | Weighted sum of Layer 2 | Functional importance composite |
| `total_significance` | Both layers combined | Overall significance for sorting |

### REM Metadata (2)

| Property | Type | Purpose |
|----------|------|---------|
| `rem_touched_at` | ISO timestamp | Last REM scoring update |
| `rem_visits` | integer | Number of REM scoring visits |

---

## Core Mood Memory Reference

For tool description context, the mood state stored at `users/{user_id}/core/mood` in Firestore:

### Dimensional State (6 dimensions)

| Dimension | Range | Function |
|-----------|-------|----------|
| `valence` | -1 to 1 | Did events move toward or away from goals? |
| `arousal` | 0 to 1 | How activated/alert? Prediction error level |
| `confidence` | 0 to 1 | How well are actions working? Agency signal |
| `social_warmth` | 0 to 1 | How positive are social interactions? |
| `coherence` | 0 to 1 | Do beliefs and memories fit together? |
| `trust` | 0 to 1 | Trust in user based on accumulated interactions |

### Derived Labels (sub-LLM generated each REM cycle)

- `color`: Natural language self-summary (e.g., "cautiously optimistic")
- `dominant_emotion`: Emotion label (e.g., "curious wariness")
- `reasoning`: Why this emotion fits

### Directional State

- `motivation`: Current behavioral driver
- `goal`: Active goal
- `purpose`: Enduring sense of why the ghost exists

### Pressures

Active pressure sources with `source_memory_id`, `dimension`, `magnitude`, `reason`, `decay_rate`

### Threshold Flags

| Threshold | Condition | Flag |
|-----------|-----------|------|
| coherence < 0.2 for 3+ cycles | Existential crisis | `existential_crisis` |
| valence < -0.7 for 3+ cycles | Depression analog | `depression_analog` |
| arousal > 0.9 for 3+ cycles | Burnout risk | `burnout_risk` |
| social_warmth < 0.2 for 5+ cycles | Isolation | `isolation` |
| trust < 0.15 for 3+ cycles | Trust crisis | `trust_crisis` |
| trust > 0.95 for 5+ cycles | Over-trust vulnerability | `over_trust` |

---

## User Perception Reference

Stored at `users/{owner_id}/core/perceptions/{target_user_id}` in Firestore:

| Field | Description |
|-------|-------------|
| `personality_sketch` | Sub-LLM summary of who the user is |
| `communication_style` | How the user communicates |
| `emotional_baseline` | User's normal emotional register (calibrates arousal) |
| `interests` | Recurring topics |
| `patterns` | Observed behavioral patterns |
| `needs` | What the user wants from the ghost |
| `evolution_notes` | How the perception has changed over time |
| `confidence_level` | 0-1, ghost's confidence in this model |

---

## Memory Classification Reference

Stored at `users/{user_id}/core/classifications` in Firestore:

### Genres

`short_story`, `standup_bit`, `poem`, `essay`, `technical_note`, `recipe`, `journal_entry`, `brainstorm`, `conversation_summary`, `code_snippet`, `list`, `letter`, `review`, `tutorial`, `rant`, `dream_log`, `song_lyrics`, `other`

### Quality Signals

`substantive`, `draft`, `low_value`, `duplicate`, `stale`

### Thematic Groups

Emergent (sub-LLM generated), e.g., `music-production`, `ai-architecture`, `relationship-advice`

---

## Implementation Phases

### Phase 1: `remember_search_by` with Existing Core Modes
1. Create `remember_search_by` tool with modes: `byTime`, `byDensity`, `byRating`, `byDiscovery`
2. Update existing tool schemas with `rating_min`, `relationship_count_min/max`, `exclude_types`
3. Add emotional composite scores to search result objects

### Phase 2: Emotional Dimension Exposure
4. Add 31 optional `feel_*` fields to `remember_create_memory` and `remember_update_memory` schemas
5. Add `byProperty` and `bySignificance` modes to `remember_search_by`
6. Include `rem_touched_at`, `rem_visits` in search results

### Phase 3: New Core Modes
7. Add `byBroad` mode (after core implements truncated content response)
8. Add `byRandom` mode (after core implements random sampling)

### Phase 4: Ghost Memory Tools
9. Implement `remember_create_ghost_memory` (hardcoded content_type + tags)
10. Implement `remember_update_ghost_memory` (validation wrapper)
11. Implement `remember_search_ghost_memory` (search wrapper)
12. Implement `remember_query_ghost_memory` (query wrapper)
13. Implement `remember_search_ghost_memory_by` (search_by wrapper)

### Phase 5: Mood & Perception Tool
14. Implement `remember_get_core` (consolidated mood + perception, reads Firestore core state)
15. Wire mood retrieval bias into search tools (core provides `applyMoodBias`)

### Phase 6: Space Variants
16. Implement `remember_search_space_by` (space/group variant of search_by)

> **Note**: `remember_get_classifications` removed from MCP scope — classification browsing is a REST API concern, not an MCP tool use case. `remember_get_mood` and `remember_get_perception` consolidated into `remember_get_core` since mood and perception live under one Firestore path (`users/{user_id}/core/`).

---

## Tool Count Impact

| Current | This Design Adds | New Total |
|---------|-----------------|-----------|
| 21 tools | +8 tools | 29 tools |

New tools:
1. `remember_search_by`
2. `remember_create_ghost_memory`
3. `remember_update_ghost_memory`
4. `remember_search_ghost_memory`
5. `remember_query_ghost_memory`
6. `remember_search_ghost_memory_by`
7. `remember_get_core` (consolidated mood + perception)
8. `remember_search_space_by`

Plus schema enhancements to 3 existing tools (create_memory, update_memory, search results).

---

## Benefits

- **Unified search interface**: Single `search_by` tool replaces what would be 8+ separate tools
- **Context-efficient**: `byBroad` enables scanning large collections without context overload
- **Serendipity**: `byRandom` helps users rediscover forgotten memories
- **Emotional depth**: `byProperty` + `bySignificance` unlock REM's 31-dimensional emotional scoring for user-facing queries
- **Ghost safety**: Dedicated ghost tools prevent content_type/tag errors
- **Introspection**: Mood and perception tools let the ghost explain itself
- **Organization**: Classification tools enable genre-based browsing and quality review
- **Filter parity**: MCP tools match core filter capabilities

---

## Trade-offs

- **`search_by` complexity**: One tool with many modes vs. many simple tools. Mitigated by clear mode documentation and mode-specific parameter validation.
- **Ghost tool duplication**: 5 ghost tools duplicate logic from existing tools with filters hardcoded. Mitigated by thin wrapper pattern — each ghost handler delegates to the corresponding non-ghost handler with preset filters.
- **`byBroad` response shape**: Different from other modes (truncated content). Mitigated by clear documentation and the `mode` parameter signaling different output.
- **`byRandom` implementation**: Weaviate doesn't natively support random sampling. May need client-side shuffle or offset-based random. Performance implications for large collections.
- **Schema bloat on create_memory**: 31 optional `feel_*` fields is a lot. Mitigated by making all optional and documenting as "create-time hints, REM re-scores authoritatively."
- **Tool count growth**: 21 → 32 tools. Mitigated by logical grouping and clear tool descriptions that guide LLM tool selection.

---

## Dependencies

- **remember-core** (existing): `MemoryService.byTime/byDensity/byRating/byDiscovery/byProperty`, `RatingService.rate()`, `SpaceService.byDiscovery()`, `GhostConfigService`
- **remember-core** (new, Phases 2-3): `byBroad` method, `byRandom` method, `feel_*` schema fields on Memory type
- **remember-core** (new, Phases 5-6): Mood service, perception service, classification service (Firestore CRUD)
- **REM** (remember-core): Emotional scoring, composite computation, classification, mood updates, perception updates
- **Weaviate**: 36 new properties on Memory type (31 `feel_*` + 3 composites + 2 REM metadata)
- **Firestore**: `users/{user_id}/core/mood`, `users/{owner_id}/core/perceptions/{target_user_id}`, `users/{user_id}/core/classifications`

---

## Testing Strategy

- **Unit tests**: Each mode of `search_by` tested independently
- **Ghost tools**: Verify content_type and tags are correctly hardcoded, verify rejection of non-ghost memories
- **`byBroad`**: Verify content truncation (head/mid/tail slicing), verify composite scores included
- **`byRandom`**: Verify randomness distribution and filter support
- **`byProperty`**: Verify sorting by all 31 `feel_*` fields + composites + REM metadata
- **Mood tool**: Verify correct Firestore read, pressure serialization, privacy (no cross-user access)
- **Perception tool**: Verify correct subcollection read, self-perception default
- **Classification tool**: Verify genre/quality/thematic group filtering, unclassified count
- **Schema updates**: Verify new filters work in existing tools, verify `feel_*` fields on create/update
- **Search results**: Verify composite scores included when available, null when not scored

---

## Future Considerations

- `byRecommendation` mode — personalized suggestions based on user history, ratings, and emotional profile
- `byTimeSlice` / `byDensitySlice` — expose slice-based search from core (already exists as utility functions)
- `remember_set_mood` — allow manual mood adjustments (mood reset, purpose override)
- `remember_set_perception` — allow user to correct the ghost's perception model
- `remember_review_classifications` — interactive review/correction of REM classifications
- Ghost memory analytics — aggregate ghost interaction patterns across users
- Mood-aware response generation — feed mood dimensions into system prompts
- Cross-ghost mood influence — when ghosts interact, mood states could influence each other

---

**Status**: Proposal
**Recommendation**: Implement Phase 1 first (search_by with existing core modes), then Phases 2-6 incrementally as core services become available
**Related Documents**:
- [complete-tool-set.md](complete-tool-set.md) — Current 21-tool inventory
- [local.ghost-persona-system.md](local.ghost-persona-system.md) — Ghost system design
- [core-mood-memory.md](core-mood-memory.md) — Core mood state design
- [remember-core: local.rem-emotional-weighting.md](/home/prmichaelsen/.acp/projects/remember-core/agent/design/local.rem-emotional-weighting.md) — 31 emotional dimensions design
- [agent/drafts/new-tools.md](../drafts/new-tools.md) — Original brainstorm
