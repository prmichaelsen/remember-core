# Task 180: Haiku Editorial Evaluation Service

**Milestone**: M36 — byCurated Sort Mode
**Status**: Not Started
**Estimated Hours**: 4
**Dependencies**: Task 179
**Design Reference**: [byCurated Sort Mode](../../design/local.by-curated-sort-mode.md)

---

## Objective

Implement per-memory Haiku editorial quality evaluation with evaluate-once-permanent policy. Each memory is scored exactly once across its lifetime — never re-evaluated.

## Steps

### 1. Editorial Evaluation Service

Create `src/services/editorial-scoring.service.ts`:

```typescript
export interface EditorialScoringServiceParams {
  subLlm: SubLlmProvider;  // reuse existing Haiku provider pattern
  logger: Logger;
}

export interface EditorialResult {
  score: number;     // 0.0-1.0
  reason: string;    // brief explanation
}
```

### 2. Haiku Prompt

```
Evaluate this memory for quality on a 0.0-1.0 scale.

Criteria (equal weight):
- Writing quality: clarity, coherence, readability
- Informational value: teaches something, contains substance
- Uniqueness: distinct from generic/boilerplate content
- Completeness: self-contained, well-formed
- Creativity: originality, artistic merit (poems, stories)
- Vulnerability/depth: emotional honesty (journals, reflections)
- Impact: significance of the event or insight described

Memory content:
{content, truncated to ~500 chars}

Respond with JSON: { "score": 0.0-1.0, "reason": "brief explanation" }
```

### 3. Evaluate-Once Policy

- Only evaluate memories where `editorial_score === 0` (unset)
- After scoring, write `editorial_score` to Weaviate — permanent, never re-evaluated
- This bounds Haiku cost to new memory creation rate, not collection size

### 4. Batch Evaluation

- Accept a batch of memory IDs
- Filter to only those with `editorial_score === 0`
- Evaluate in parallel (respect rate limits)
- Cost cap: track call count, stop at configurable limit per cycle (default ~16,000 at $50 budget)

## Verification

- [ ] EditorialScoringService created with SubLlmProvider dependency
- [ ] Prompt matches design spec (7 criteria, 500-char content truncation)
- [ ] JSON response parsing with fallback for malformed responses
- [ ] Only evaluates memories with `editorial_score === 0`
- [ ] Writes `editorial_score` to Weaviate after evaluation
- [ ] Batch evaluation with configurable batch size
- [ ] Cost cap stops evaluation when budget exhausted
- [ ] Unit tests with mock SubLlmProvider
- [ ] Tests colocated in `editorial-scoring.service.spec.ts`
