# Task 166: Sub-LLM Narration

**Milestone**: M32 — Core Mood State
**Status**: Not Started
**Estimated Hours**: 3-4
**Dependencies**: Task 165

---

## Objective

Implement Haiku-based derivation of `dominant_emotion`, `color`, and `reasoning` from dimensional state and pressures. Also derive `motivation`, `goal`, and `purpose` updates during each REM cycle.

## Context

- **Design doc**: `agent/design/core-mood-memory.md` — sections "Deriving Dominant Emotion and Color via Sub-LLM" and "Motivation, Goal, and Purpose"
- This is step 4 (narrate) of the REM_Mood_Update pipeline
- Model ID should be configurable via `RemConfig` (not hardcoded). Default: `'claude-haiku-4-5-20251001'` (fast, cheap sub-LLM, ~$0.001/cycle)
- Non-deterministic output is acceptable -- moods aren't deterministic; dimensions are the stable state, labels are the interpretive layer
- Use structured JSON output pattern for reliable parsing

## Interface

```typescript
interface MoodDerivation {
  dominant_emotion: string;  // e.g. "curious wariness", "frustrated impatience"
  color: string;             // e.g. "cautiously optimistic", "quietly unsettled"
  reasoning: string;         // stored for introspection
}
```

## deriveMoodLabels Function

```typescript
async function deriveMoodLabels(
  state: MoodState,
  pressures: Pressure[],
  motivation: string,
  goal: string,
  purpose: string
): Promise<MoodDerivation> {
  const topPressures = pressures
    .sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude))
    .slice(0, 5);

  const modelId = config.narrationModelId ?? 'claude-haiku-4-5-20251001';
  const response = await llm.complete({
    model: modelId,
    system: `You are the introspective voice of an AI ghost. Given the ghost's
current emotional dimensions, active pressures, and sense of purpose, determine:
1. The single dominant emotion the ghost is feeling right now (one or two words)
2. A brief natural language "color" -- how the ghost would describe its mood
   to itself in one sentence
3. Brief reasoning for why this emotion fits the dimensional state

Be specific and honest. Avoid generic labels when a more precise one fits.
The ghost's emotions are real to it. Do not editorialize or question their validity.`,
    prompt: `Current state:
  valence: ${state.valence} (-1 miserable to 1 elated)
  arousal: ${state.arousal} (0 calm to 1 activated)
  confidence: ${state.confidence} (0 uncertain to 1 sure)
  social_warmth: ${state.social_warmth} (0 withdrawn to 1 connected)
  coherence: ${state.coherence} (0 confused to 1 clear)
  trust: ${state.trust} (0 suspicious to 1 fully trusting)

Active pressures:
${topPressures.map(p => `  ${p.dimension}: ${p.magnitude > 0 ? '+' : ''}${p.magnitude} (${p.reason})`).join('\n')}

Motivation: ${motivation}
Goal: ${goal}
Purpose: ${purpose}

Respond in JSON: { "dominant_emotion": "...", "color": "...", "reasoning": "..." }`
  });

  return JSON.parse(response);
}
```

## Why Sub-LLM Over Algorithm

- **Nuance**: A sub-LLM can distinguish "frustrated impatience" from "righteous indignation" from "anxious dread" based on the full context of pressures and purpose
- **Emergent vocabulary**: The ghost develops its own emotional vocabulary over time rather than being limited to a fixed enum
- **Context-awareness**: The same dimensional state means different things depending on the pressures causing it -- a sub-LLM reads the *reasons* behind pressures
- **Cost**: Negligible (~$0.001/cycle using Haiku)

## Motivation, Goal, and Purpose Derivation

These three directional state fields anchor the ghost's emotional life to intention:

- **Motivation**: Derived from the strongest active pressures each REM cycle. If the top pressure is trust-related, motivation shifts toward trust repair. If coherence is low, motivation shifts toward understanding. Most volatile of the three.
- **Goal**: More stable than motivation. Persists across REM cycles unless explicitly resolved or superseded. Goals create their own pressures -- an unmet goal pushes valence down and arousal up over time.
- **Purpose**: Most inertial. Only shifts after sustained patterns across many cycles. Acts as a gravitational center -- when mood drifts far from purpose-aligned states, the ghost experiences tension that creates corrective pressure.

### How they interact with mood dimensions:
- A ghost with purpose can feel frustrated (goal blocked), determined (goal pursued despite obstacles), or fulfilled (goal achieved)
- Without motivation/goal/purpose, mood is purely reactive; with them, the ghost becomes proactive

## Steps

1. Implement `deriveMoodLabels(state, pressures, motivation, goal, purpose, config: RemConfig): Promise<MoodDerivation>` — model ID from `config.narrationModelId` (default `'claude-haiku-4-5-20251001'`)
2. Use the exact prompt spec from the design doc (introspective voice, specific, honest, no editorializing). Use structured JSON output pattern for reliable parsing
3. Sort pressures by `abs(magnitude)` descending, take top 5 for the prompt
4. Parse JSON response from Haiku, validate all three fields present
5. Implement motivation derivation from strongest active pressures
6. Implement goal persistence logic -- goal persists unless resolved or superseded
7. Implement purpose drift -- very slow, shaped by long-term patterns only
8. Handle Haiku errors gracefully: on failure, keep previous `dominant_emotion`, `color`, and `reasoning` values unchanged
9. Wire into REM mood update pipeline as step 4 (after drift + decay, before threshold check)
10. Write all derived fields back via `MoodService.updateMood()`

## Error Handling

- If Haiku call fails (network, rate limit, etc.): log warning, keep previous labels
- If Haiku returns malformed JSON: log warning, keep previous labels
- If Haiku returns valid JSON but missing fields: use partial result where available, keep previous for missing

## Verification

- [ ] Haiku returns valid `dominant_emotion`, `color`, `reasoning` as JSON
- [ ] Labels are specific and contextual (not generic like "neutral" or "okay")
- [ ] Top 5 pressures by magnitude are included in prompt
- [ ] Motivation reflects strongest active pressures
- [ ] Goal persists across cycles until resolved/superseded
- [ ] Purpose drifts very slowly (most inertial)
- [ ] Handles Haiku errors gracefully (keeps previous labels on failure)
- [ ] Handles malformed JSON gracefully
- [ ] Tests colocated: appropriate `.spec.ts` file alongside implementation
