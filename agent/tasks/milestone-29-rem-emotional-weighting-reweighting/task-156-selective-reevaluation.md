# Task 156: Selective Re-evaluation via Sub-LLM Dimension Impact Analysis

**Milestone**: M29 — REM Emotional Weighting — Retroactive Reweighting
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 153

---

## Objective

Implement selective re-evaluation so that instead of re-scoring all 31 emotional dimensions on every trigger, a sub-LLM call determines which dimensions are actually impacted by the new information. Only impacted dimensions are re-scored, minimizing LLM calls.

Instead of re-scoring all 31 dimensions, ask: "Given this memory and this new context, which dimensions does the new information impact? Return an array of dimension names to re-evaluate."

---

## Steps

1. Create sub-LLM prompt template for dimension impact analysis — input: memory content, original scores, new context (relationships, retrieval stats, related memories); output: array of impacted dimension names
2. Implement `analyzeImpactedDimensions(memory, newContext)` — calls sub-LLM and parses the response into a dimension name array
3. Validate returned dimensions against the known 31-dimension schema
4. Trigger scoring calls only for the impacted dimensions, preserving existing scores for unaffected dimensions
5. Merge partial new scores with existing scores and recompute composite scores

---

## Verification

- [ ] Sub-LLM prompt produces valid dimension arrays for various context types
- [ ] Only impacted dimensions are re-scored (not all 31)
- [ ] Invalid dimension names in LLM response are filtered out gracefully
- [ ] Existing scores preserved for non-impacted dimensions
- [ ] Composite scores correctly recomputed from mixed old + new dimension scores
- [ ] Total LLM calls reduced compared to full 31-dimension re-scoring

---

## Expected Output

- `analyzeImpactedDimensions` function with sub-LLM integration
- Partial re-scoring pipeline that merges new scores into existing emotional weight records
- Measurable reduction in LLM calls during re-evaluation passes
