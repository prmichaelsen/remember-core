/**
 * Editorial Scoring Service — one-time per-memory Haiku quality evaluation.
 *
 * Each memory is scored exactly once across its lifetime (evaluate-once-permanent).
 * Only evaluates memories with editorial_score === 0 (unset).
 */

import type { SubLlmProvider } from './emotional-scoring.service.js';

// ── Types ──

export interface EditorialResult {
  score: number;
  reason: string;
}

export interface EditorialScoringServiceParams {
  subLlm: SubLlmProvider;
  logger?: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void };
}

export interface EditorialMemory {
  id: string;
  content: string;
  editorial_score?: number;
}

export interface EditorialBatchResult {
  evaluated: number;
  skipped: number;
  results: Array<{ memory_id: string; score: number; reason: string }>;
}

// ── Constants ──

/** Maximum content length sent to Haiku (truncated to ~500 chars) */
export const MAX_CONTENT_LENGTH = 500;

/** Default max evaluations per batch (cost cap) */
export const DEFAULT_BATCH_LIMIT = 16000;

// ── Prompt ──

export function buildEditorialPrompt(content: string): string {
  const truncated = content.length > MAX_CONTENT_LENGTH
    ? content.slice(0, MAX_CONTENT_LENGTH) + '...'
    : content;

  return `Evaluate this memory for quality on a 0.0-1.0 scale.

Criteria (equal weight):
- Writing quality: clarity, coherence, readability
- Informational value: teaches something, contains substance
- Uniqueness: distinct from generic/boilerplate content
- Completeness: self-contained, well-formed
- Creativity: originality, artistic merit (poems, stories)
- Vulnerability/depth: emotional honesty (journals, reflections)
- Impact: significance of the event or insight described

Memory content:
${truncated}

Respond with JSON: { "score": 0.0-1.0, "reason": "brief explanation" }`;
}

// ── Response Parsing ──

export function parseEditorialResponse(response: string): EditorialResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[^}]*"score"\s*:\s*[\d.]+[^}]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const score = Number(parsed.score);
      if (isNaN(score) || score < 0 || score > 1) {
        return { score: 0.5, reason: 'parse_fallback' };
      }
      return { score, reason: parsed.reason || '' };
    }

    // Fallback: try to extract a bare number
    const numMatch = response.match(/\b(0\.\d+|1\.0|0|1)\b/);
    if (numMatch) {
      return { score: Number(numMatch[1]), reason: 'extracted_number' };
    }

    return { score: 0.5, reason: 'parse_fallback' };
  } catch {
    return { score: 0.5, reason: 'parse_error' };
  }
}

// ── Service ──

export class EditorialScoringService {
  private readonly subLlm: SubLlmProvider;
  private readonly logger?: EditorialScoringServiceParams['logger'];

  constructor(params: EditorialScoringServiceParams) {
    this.subLlm = params.subLlm;
    this.logger = params.logger;
  }

  /**
   * Evaluate a single memory's editorial quality.
   */
  async evaluate(content: string): Promise<EditorialResult> {
    const prompt = buildEditorialPrompt(content);
    const response = await this.subLlm.score(prompt);
    return parseEditorialResponse(response);
  }

  /**
   * Evaluate a batch of memories, skipping those already scored.
   * Only evaluates memories with editorial_score === 0 or undefined.
   */
  async evaluateBatch(
    memories: EditorialMemory[],
    batchLimit = DEFAULT_BATCH_LIMIT,
  ): Promise<EditorialBatchResult> {
    const toEvaluate = memories.filter(
      (m) => !m.editorial_score || m.editorial_score === 0,
    );
    const skipped = memories.length - toEvaluate.length;

    const capped = toEvaluate.slice(0, batchLimit);
    const results: EditorialBatchResult['results'] = [];

    for (const memory of capped) {
      try {
        const result = await this.evaluate(memory.content);
        results.push({
          memory_id: memory.id,
          score: result.score,
          reason: result.reason,
        });
      } catch (err) {
        this.logger?.warn(`Editorial scoring failed for ${memory.id}:`, err);
        results.push({
          memory_id: memory.id,
          score: 0.5,
          reason: 'evaluation_error',
        });
      }
    }

    this.logger?.info(`Editorial scoring: ${results.length} evaluated, ${skipped} skipped (already scored)`);

    return {
      evaluated: results.length,
      skipped,
      results,
    };
  }
}
