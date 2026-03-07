/**
 * EmotionalScoringService — per-dimension Haiku scoring for REM emotional weighting.
 *
 * Scores each memory on 31 independent dimensions (21 feel_* + 10 functional_*)
 * via individual sub-LLM calls with dimension-specific rubrics.
 *
 * See: agent/design/local.rem-emotional-weighting.md
 */

import { FEEL_DIMENSION_PROPERTIES, FUNCTIONAL_DIMENSION_PROPERTIES, ALL_SCORING_DIMENSIONS } from '../database/weaviate/v2-collections.js';
import type { Logger } from '../utils/logger.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface DimensionDefinition {
  property: string;
  layer: 'feel' | 'functional';
  category: string;
  description: string;
  range: { min: number; max: number };
  rubric: {
    low: string;
    mid: string;
    high: string;
  };
}

export interface ScoringContext {
  relationship_observations?: string[];
  nearest_neighbor_scores?: Record<string, number>;
  collection_averages?: Record<string, number>;
}

export interface ScoringInput {
  memory: {
    content: string;
    content_type: string;
    created_at: string;
  };
  dimension: DimensionDefinition;
  context?: ScoringContext;
}

export interface ScoringResult {
  property: string;
  score: number | null;
}

export interface SubLlmProvider {
  score(prompt: string, options?: { maxTokens?: number }): Promise<string>;
}

// ─── Dimension Registry ──────────────────────────────────────────────────

export const DIMENSION_REGISTRY: DimensionDefinition[] = [
  // ── Layer 1: Discrete Emotions (feel_) ──────────────────────────────

  // Meta
  {
    property: 'feel_emotional_significance',
    layer: 'feel',
    category: 'Meta',
    description: 'Overall emotional weight of the memory — how much emotional charge it carries.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Emotionally neutral or mundane (grocery list, factual note)',
      mid: 'Moderate emotional resonance (a pleasant conversation, mild frustration)',
      high: 'Deeply emotionally charged (life-changing event, profound loss, peak joy)',
    },
  },
  {
    property: 'feel_vulnerability',
    layer: 'feel',
    category: 'Meta',
    description: 'Degree of personal exposure or openness revealed in the memory.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No personal exposure (technical note, public fact)',
      mid: 'Some personal sharing (opinion, preference, mild confession)',
      high: 'Deep vulnerability (intimate fears, secrets, raw emotional disclosure)',
    },
  },
  {
    property: 'feel_trauma',
    layer: 'feel',
    category: 'Meta',
    description: 'Intensity of negative formative experience reflected in the memory.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No traumatic content',
      mid: 'References difficult experiences (setback, disappointment, mild hardship)',
      high: 'Deep trauma (abuse, severe loss, PTSD-level distress)',
    },
  },

  // Positive
  {
    property: 'feel_humor',
    layer: 'feel',
    category: 'Positive',
    description: 'Comedic or playful quality of the memory.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No humor or playfulness',
      mid: 'Mildly amusing or lighthearted',
      high: 'Genuinely funny, witty, or deeply playful',
    },
  },
  {
    property: 'feel_happiness',
    layer: 'feel',
    category: 'Core emotion',
    description: 'Positive affect, joy, contentment expressed in the memory.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No happiness or positive affect',
      mid: 'Pleasant, satisfied, content',
      high: 'Ecstatic, deeply joyful, elated',
    },
  },
  {
    property: 'feel_sadness',
    layer: 'feel',
    category: 'Core emotion',
    description: 'Negative affect, grief, loss, or melancholy in the memory.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No sadness',
      mid: 'Mild disappointment or wistfulness',
      high: 'Deep grief, profound loss, overwhelming sorrow',
    },
  },
  {
    property: 'feel_fear',
    layer: 'feel',
    category: 'Core emotion',
    description: 'Threat perception, anxiety, or dread in the memory.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No fear or anxiety',
      mid: 'Mild worry or unease',
      high: 'Intense fear, panic, existential dread',
    },
  },
  {
    property: 'feel_anger',
    layer: 'feel',
    category: 'Core emotion',
    description: 'Frustration, rage, or sense of injustice in the memory.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No anger or frustration',
      mid: 'Mild irritation or annoyance',
      high: 'Intense rage, fury, or deep sense of injustice',
    },
  },
  {
    property: 'feel_surprise',
    layer: 'feel',
    category: 'Core emotion',
    description: 'Unexpectedness or novelty in the memory.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Expected, routine content',
      mid: 'Somewhat unexpected or mildly surprising',
      high: 'Shocking, completely unexpected, paradigm-shifting',
    },
  },
  {
    property: 'feel_disgust',
    layer: 'feel',
    category: 'Core emotion',
    description: 'Aversion or rejection response in the memory.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No aversion or disgust',
      mid: 'Mild distaste or discomfort',
      high: 'Strong revulsion, moral repugnance',
    },
  },
  {
    property: 'feel_contempt',
    layer: 'feel',
    category: 'Core emotion',
    description: 'Superiority, dismissal, or looking down on something.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No contempt or dismissal',
      mid: 'Mild disdain or condescension',
      high: 'Deep scorn, absolute dismissal',
    },
  },

  // Self-conscious
  {
    property: 'feel_embarrassment',
    layer: 'feel',
    category: 'Self-conscious',
    description: 'Social discomfort from perceived misstep or awkwardness.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No embarrassment',
      mid: 'Mild social awkwardness',
      high: 'Intense cringe, deep social humiliation',
    },
  },
  {
    property: 'feel_shame',
    layer: 'feel',
    category: 'Self-conscious',
    description: 'Deep self-judgment at the identity level.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No shame or self-judgment',
      mid: 'Mild self-criticism',
      high: 'Profound shame, identity-level negative self-evaluation',
    },
  },
  {
    property: 'feel_guilt',
    layer: 'feel',
    category: 'Self-conscious',
    description: 'Sense of responsibility for harm caused to others.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No guilt',
      mid: 'Mild regret about actions',
      high: 'Intense guilt, heavy moral burden',
    },
  },
  {
    property: 'feel_excitement',
    layer: 'feel',
    category: 'Positive',
    description: 'Anticipatory positive arousal, eagerness, enthusiasm.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No excitement or anticipation',
      mid: 'Moderate interest or enthusiasm',
      high: 'Intense excitement, can barely contain anticipation',
    },
  },
  {
    property: 'feel_pride',
    layer: 'feel',
    category: 'Positive',
    description: 'Positive self-evaluation, sense of accomplishment.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No pride or accomplishment',
      mid: 'Mild satisfaction with achievement',
      high: 'Deep pride, significant personal accomplishment',
    },
  },

  // Dimensional (VAD)
  {
    property: 'feel_valence',
    layer: 'feel',
    category: 'Dimensional',
    description: 'Overall positive-negative emotional spectrum of the memory.',
    range: { min: -1, max: 1 },
    rubric: {
      low: 'Strongly negative (despair, rage, horror)',
      mid: 'Emotionally neutral or mixed',
      high: 'Strongly positive (joy, love, triumph)',
    },
  },
  {
    property: 'feel_arousal',
    layer: 'feel',
    category: 'Dimensional',
    description: 'Activation level — calm to excited.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Calm, peaceful, low-energy',
      mid: 'Moderately engaged',
      high: 'Highly activated, intense, energized',
    },
  },
  {
    property: 'feel_dominance',
    layer: 'feel',
    category: 'Dimensional',
    description: 'Feeling of control vs. submission.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Feeling powerless, submissive, out of control',
      mid: 'Neutral sense of agency',
      high: 'Feeling in control, empowered, dominant',
    },
  },
  {
    property: 'feel_intensity',
    layer: 'feel',
    category: 'Dimensional',
    description: 'Overall emotional magnitude regardless of type.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Emotionally flat or detached',
      mid: 'Normal emotional engagement',
      high: 'Overwhelming emotional intensity',
    },
  },

  // Cognitive
  {
    property: 'feel_coherence_tension',
    layer: 'feel',
    category: 'Cognitive',
    description: 'Degree of conflict with existing beliefs or memories.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Consistent with existing worldview',
      mid: 'Mildly challenges or complicates existing beliefs',
      high: 'Deeply contradicts or disrupts existing mental model',
    },
  },

  // ── Layer 2: Functional Signals (functional_) ──────────────────────

  {
    property: 'functional_salience',
    layer: 'functional',
    category: 'Attention',
    description: 'How unexpected or novel this is — prediction error signal.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Completely expected, routine content',
      mid: 'Somewhat notable or attention-worthy',
      high: 'Highly salient, demands attention, breaks expectations',
    },
  },
  {
    property: 'functional_urgency',
    layer: 'functional',
    category: 'Temporal',
    description: 'How time-sensitive this memory is — decay rate signal.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No time pressure, evergreen content',
      mid: 'Moderate time relevance (weeks/months)',
      high: 'Highly urgent, time-critical (hours/days)',
    },
  },
  {
    property: 'functional_social_weight',
    layer: 'functional',
    category: 'Social',
    description: 'How much this affected relationships or reputation.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No social impact',
      mid: 'Moderate social relevance (affects one relationship)',
      high: 'Major social impact (affects multiple relationships, reputation)',
    },
  },
  {
    property: 'functional_agency',
    layer: 'functional',
    category: 'Attribution',
    description: 'Whether this was caused by the agent/bot\'s own actions.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'User-generated content, agent had no role',
      mid: 'Agent partially involved (collaborative)',
      high: 'Directly caused or created by the agent',
    },
  },
  {
    property: 'functional_novelty',
    layer: 'functional',
    category: 'Information',
    description: 'How unique this is relative to the collection.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Redundant, duplicates existing knowledge',
      mid: 'Adds some new information',
      high: 'Entirely new territory, no existing parallels',
    },
  },
  {
    property: 'functional_retrieval_utility',
    layer: 'functional',
    category: 'Utility',
    description: 'Likely usefulness in future queries.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Unlikely to be retrieved again (ephemeral note)',
      mid: 'Occasionally useful for reference',
      high: 'Frequently needed, core reference material',
    },
  },
  {
    property: 'functional_narrative_importance',
    layer: 'functional',
    category: 'Narrative',
    description: 'Whether this advances or anchors a personal story arc.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Isolated fact, no narrative significance',
      mid: 'Part of an ongoing thread or project',
      high: 'Pivotal moment, turning point in personal narrative',
    },
  },
  {
    property: 'functional_aesthetic_quality',
    layer: 'functional',
    category: 'Aesthetic',
    description: 'Beauty, craft, or artistry of the content.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'No aesthetic value (raw data, plain text)',
      mid: 'Some craft or intentional form',
      high: 'Beautiful, well-crafted, artistically significant',
    },
  },
  {
    property: 'functional_valence',
    layer: 'functional',
    category: 'Evaluation',
    description: 'Positive-negative functional spectrum — independent from emotional valence.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Functionally negative (harmful, destructive, counterproductive)',
      mid: 'Functionally neutral',
      high: 'Functionally positive (helpful, constructive, beneficial)',
    },
  },
  {
    property: 'functional_coherence_tension',
    layer: 'functional',
    category: 'Cognitive',
    description: 'Functional conflict with existing patterns — independent from emotional coherence tension.',
    range: { min: 0, max: 1 },
    rubric: {
      low: 'Fits smoothly into existing patterns and habits',
      mid: 'Mildly disrupts established routines or expectations',
      high: 'Fundamentally contradicts established patterns or priorities',
    },
  },
];

// ─── Prompt Building ──────────────────────────────────────────────────────

export function buildScoringPrompt(input: ScoringInput): string {
  const { memory, dimension, context } = input;

  let contextSection = '';
  if (context) {
    const parts: string[] = [];
    if (context.relationship_observations?.length) {
      parts.push(`Relationship observations:\n${context.relationship_observations.map(o => `  - ${o}`).join('\n')}`);
    }
    if (context.nearest_neighbor_scores && Object.keys(context.nearest_neighbor_scores).length > 0) {
      const entries = Object.entries(context.nearest_neighbor_scores)
        .map(([dim, score]) => `  ${dim}: ${score.toFixed(2)}`)
        .join('\n');
      parts.push(`Similar memories' scores for this dimension:\n${entries}`);
    }
    if (context.collection_averages && Object.keys(context.collection_averages).length > 0) {
      const avg = context.collection_averages[dimension.property];
      if (avg !== undefined) {
        parts.push(`Collection average for ${dimension.property}: ${avg.toFixed(2)}`);
      }
    }
    if (parts.length > 0) {
      contextSection = `\nCONTEXT:\n${parts.join('\n\n')}`;
    }
  }

  const rangeStr = dimension.range.min === -1
    ? `between -1 and 1`
    : `between 0 and 1`;

  return `You are scoring a memory on the dimension "${dimension.property}".

DIMENSION DEFINITION:
${dimension.description}

SCORING RUBRIC:
- ${dimension.range.min} (low): ${dimension.rubric.low}
- ${(dimension.range.min + dimension.range.max) / 2} (mid): ${dimension.rubric.mid}
- ${dimension.range.max} (high): ${dimension.rubric.high}

MEMORY:
Content: ${memory.content}
Type: ${memory.content_type}
Created: ${memory.created_at}
${contextSection}

Respond with ONLY a single number ${rangeStr}. No other text.`;
}

// ─── Service ──────────────────────────────────────────────────────────────

export interface EmotionalScoringServiceParams {
  subLlm: SubLlmProvider;
  logger?: Logger;
}

export class EmotionalScoringService {
  private readonly subLlm: SubLlmProvider;
  private readonly logger: Logger;

  constructor(params: EmotionalScoringServiceParams) {
    this.subLlm = params.subLlm;
    this.logger = params.logger ?? console;
  }

  /**
   * Score a single memory on a single dimension.
   * Returns null on failure (does not throw).
   */
  async scoreDimension(input: ScoringInput): Promise<ScoringResult> {
    try {
      const prompt = buildScoringPrompt(input);
      const response = await this.subLlm.score(prompt);

      const score = parseScore(response, input.dimension.range);
      if (score === null) {
        this.logger.debug?.(`[EmotionalScoring] Invalid response for ${input.dimension.property}: "${response}"`);
      }

      return { property: input.dimension.property, score };
    } catch (err) {
      this.logger.debug?.(`[EmotionalScoring] Failed to score ${input.dimension.property}: ${err}`);
      return { property: input.dimension.property, score: null };
    }
  }

  /**
   * Score a single memory on all 31 dimensions.
   * Returns a map of property name to score (or null on failure).
   * Handles partial failures gracefully.
   */
  async scoreAllDimensions(
    memory: { content: string; content_type: string; created_at: string },
    context?: ScoringContext,
  ): Promise<Record<string, number | null>> {
    const results: Record<string, number | null> = {};

    for (const dimension of DIMENSION_REGISTRY) {
      const result = await this.scoreDimension({
        memory,
        dimension,
        context,
      });
      results[result.property] = result.score;
    }

    return results;
  }

  /**
   * Get the dimension definition for a given property name.
   */
  getDimension(property: string): DimensionDefinition | undefined {
    return DIMENSION_REGISTRY.find(d => d.property === property);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Parse a numeric score from sub-LLM response text.
 * Returns null if response is not a valid number within range.
 */
export function parseScore(
  response: string,
  range: { min: number; max: number },
): number | null {
  const trimmed = response.trim();
  const value = parseFloat(trimmed);

  if (isNaN(value)) return null;
  if (value < range.min || value > range.max) return null;

  return value;
}

// ─── Factory ──────────────────────────────────────────────────────────────

/**
 * Create a SubLlmProvider that calls the Anthropic Messages API.
 */
export function createAnthropicSubLlm(options: {
  apiKey: string;
  model?: string;
}): SubLlmProvider {
  const model = options.model ?? 'claude-haiku-4-5-20251001';

  return {
    async score(prompt: string, opts?: { maxTokens?: number }): Promise<string> {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: opts?.maxTokens ?? 16,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        throw new Error(`api_error: ${response.status}`);
      }

      const data = await response.json() as any;
      return data.content?.[0]?.text ?? '';
    },
  };
}
