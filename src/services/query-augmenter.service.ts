/**
 * QueryAugmenterService — Generate synthetic questions for improved query-content matching.
 *
 * Accepts a memory's content and generates 3-5 natural questions it could answer,
 * using Haiku for LLM-based question generation.
 */

import type { Logger } from '../utils/logger.js';
import type { SubLlmProvider } from './emotional-scoring.service.js';
import type { Memory } from '../types/memory.types.js';

// ─── Types ───────────────────────────────────────────────────────────────

export interface QueryAugmenterConfig {
  /** Max questions per memory (default: 5) */
  max_queries_per_memory?: number;
  /** Min content length to process (default: 50 chars) */
  min_content_length?: number;
  /** Max content length sent to Haiku (default: 2000 chars) */
  max_content_sample?: number;
}

export interface GenerateQueriesInput {
  /** Memory content to generate questions for */
  content: string;
  /** Optional context for better question generation */
  title?: string;
  content_type?: string;
}

export interface GenerateQueriesResult {
  /** Generated questions */
  queries: string[];
  /** Whether generation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ─── Service ─────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<QueryAugmenterConfig> = {
  max_queries_per_memory: 5,
  min_content_length: 50,
  max_content_sample: 2000,
};

export class QueryAugmenterService {
  private config: Required<QueryAugmenterConfig>;

  constructor(
    private subLlm: SubLlmProvider,
    private logger: Logger,
    config?: QueryAugmenterConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate 3-5 searchable questions for a memory.
   */
  async generateQueries(input: GenerateQueriesInput): Promise<GenerateQueriesResult> {
    // Validate content length
    if (input.content.length < this.config.min_content_length) {
      this.logger.debug('Content too short for query generation', {
        length: input.content.length,
        min: this.config.min_content_length,
      });
      return {
        queries: [],
        success: true,
        error: 'Content too short',
      };
    }

    // Sample content to fit context window
    const sample = input.content.substring(0, this.config.max_content_sample);
    const contextInfo = [
      input.title ? `Title: ${input.title}` : null,
      input.content_type ? `Type: ${input.content_type}` : null,
    ]
      .filter(Boolean)
      .join('\\n');

    // Build prompt
    const prompt = `Generate 3-5 natural questions this content could answer.
Focus on how a user would search for this information.
Return ONLY a JSON array of strings, no other text.

${contextInfo ? `${contextInfo}\\n\\n` : ''}Content:
${sample}

Example output format:
["What screenplay did I write?", "Where is my script about gardens?", "What was that play set in a lost garden?"]

Your response (JSON array only):`;

    try {
      const response = await this.subLlm.score(prompt, { maxTokens: 150 });

      // Parse JSON response
      let queries: string[];
      try {
        // Try to parse as JSON directly
        queries = JSON.parse(response.trim());
      } catch (parseError) {
        // If parsing fails, try to extract JSON array from response
        const jsonMatch = response.match(/\\[.*\\]/s);
        if (jsonMatch) {
          queries = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Response is not valid JSON array');
        }
      }

      // Validate result
      if (!Array.isArray(queries) || queries.length === 0) {
        throw new Error('Response is not a non-empty array');
      }

      // Ensure all items are strings
      queries = queries.filter((q) => typeof q === 'string' && q.trim().length > 0);

      // Limit to max
      queries = queries.slice(0, this.config.max_queries_per_memory);

      this.logger.info('Generated queries', {
        count: queries.length,
        content_length: sample.length,
      });

      return {
        queries,
        success: true,
      };
    } catch (error) {
      this.logger.error('Failed to generate queries', {
        error: error instanceof Error ? error.message : String(error),
        content_length: sample.length,
      });

      return {
        queries: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate queries for multiple memories in batch.
   */
  async generateQueriesBatch(
    inputs: GenerateQueriesInput[],
  ): Promise<GenerateQueriesResult[]> {
    const results: GenerateQueriesResult[] = [];

    for (const input of inputs) {
      const result = await this.generateQueries(input);
      results.push(result);
    }

    return results;
  }

  /**
   * Check if a memory should be processed for query generation.
   */
  shouldProcess(memory: Partial<Memory>): boolean {
    // Skip if already generated
    if (memory.queries_generation_status === 'generated') {
      return false;
    }

    // Skip if explicitly skipped
    if (memory.queries_generation_status === 'skipped') {
      return false;
    }

    // Skip if content too short
    if (!memory.content || memory.content.length < this.config.min_content_length) {
      return false;
    }

    // Skip system content types
    const systemTypes = ['system', 'audit', 'history', 'rem', 'ghost'];
    if (memory.type && systemTypes.includes(memory.type as string)) {
      return false;
    }

    return true;
  }
}
