# Task 52: Haiku validation client

**Milestone**: [M10 - REM Background Relationships](../../milestones/milestone-10-rem-background-relationships.md)
**Estimated Time**: 3 hours
**Dependencies**: [Task 51](task-51-rem-types-clustering.md)
**Status**: Not Started

---

## Objective

Create a Haiku validation client that evaluates candidate clusters and produces relationship metadata (type, observation, strength, confidence, tags) or rejects weak clusters. This is the "intelligence" layer that gates relationship creation.

---

## Context

Embedding similarity finds candidates, but not all high-similarity clusters are meaningful relationships. Haiku acts as a second gate: given truncated memory summaries, it determines whether the cluster forms a coherent group and generates a descriptive observation that serves as the relationship's human-readable title.

---

## Steps

### 1. Define validation types in rem.types.ts

```typescript
export interface HaikuValidationInput {
  memories: Array<{
    id: string;
    content_summary: string;  // Truncated to ~200 chars
    tags: string[];
    content_type?: string;
  }>;
}

export interface HaikuValidationResult {
  valid: boolean;
  relationship_type?: string;   // e.g., "topical", "temporal", "genre"
  observation?: string;         // Descriptive title for the relationship
  strength?: number;            // 0-1
  confidence?: number;          // 0-1
  tags?: string[];
  reason?: string;              // If valid=false, why it was rejected
}
```

### 2. Create src/rem/rem.haiku.ts

```typescript
export interface HaikuClient {
  validateCluster(input: HaikuValidationInput): Promise<HaikuValidationResult>;
}

export function createHaikuClient(options: {
  apiKey: string;
  model?: string;  // Default: 'claude-haiku-4-5-20251001'
}): HaikuClient
```

Implementation:
- Build prompt from memory summaries (truncate content to ~200 chars each)
- Call Anthropic API with structured output request
- Parse response into `HaikuValidationResult`
- Handle API errors gracefully (return `{ valid: false, reason: 'api_error' }`)

### 3. Define the validation prompt

```
Given these memory summaries from a single collection, determine if they
form a meaningful group that should be linked as a relationship.

Memories:
{{#each memories}}
- [{{id}}] {{content_summary}} (tags: {{tags}})
{{/each}}

If these memories form a coherent group, respond with:
{
  "valid": true,
  "relationship_type": "<type>",
  "observation": "<descriptive title for this group>",
  "strength": <0-1>,
  "confidence": <0-1>,
  "tags": ["<relevant tags>"]
}

If they do NOT form a meaningful group, respond with:
{ "valid": false, "reason": "<why not>" }

Relationship types: topical, temporal, locational, author, genre, event, or other descriptive type.
```

### 4. Create injectable interface for testing

The `HaikuClient` interface allows mock implementations in tests:
```typescript
export function createMockHaikuClient(
  responses: Map<string, HaikuValidationResult>
): HaikuClient
```

---

## Verification

- [ ] `HaikuClient` interface defined with `validateCluster()` method
- [ ] `createHaikuClient()` calls Anthropic API with correct prompt
- [ ] Memory content truncated to ~200 chars
- [ ] API errors return `{ valid: false }` (no throw)
- [ ] `createMockHaikuClient()` available for testing
- [ ] `HaikuValidationInput` and `HaikuValidationResult` types exported
- [ ] Build compiles

---

## Notes

- No new dependencies needed — use raw `fetch()` to call Anthropic API (avoid adding `@anthropic-ai/sdk` as a dependency)
- Or accept an Anthropic client as an injected dependency (let the consumer provide it)
- The prompt should request JSON output and parse it

---

**Next Task**: [Task 53: RemService — runCycle orchestration](task-53-rem-service-run-cycle.md)
**Related Design Docs**: [REM Design](../../design/local.rem-background-relationships.md) (Haiku Validation & Naming)
