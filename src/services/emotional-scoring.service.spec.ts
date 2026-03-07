import {
  EmotionalScoringService,
  DIMENSION_REGISTRY,
  buildScoringPrompt,
  buildBatchScoringPrompt,
  parseScore,
  parseBatchScores,
  type SubLlmProvider,
  type ScoringContext,
  type DimensionDefinition,
} from './emotional-scoring.service.js';
import {
  FEEL_DIMENSION_PROPERTIES,
  FUNCTIONAL_DIMENSION_PROPERTIES,
  ALL_SCORING_DIMENSIONS,
} from '../database/weaviate/v2-collections.js';

function createMockSubLlm(response: string = '0.5'): SubLlmProvider & { score: jest.Mock } {
  return {
    score: jest.fn().mockResolvedValue(response),
  };
}

function createMockLogger() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

const SAMPLE_MEMORY = {
  content: 'Today I finally finished the project I have been working on for months.',
  content_type: 'journal_entry',
  created_at: '2026-03-07T12:00:00.000Z',
};

describe('EmotionalScoringService', () => {
  // ── Dimension Registry ────────────────────────────────────────────

  describe('DIMENSION_REGISTRY', () => {
    it('has exactly 31 entries', () => {
      expect(DIMENSION_REGISTRY).toHaveLength(31);
    });

    it('has 21 feel_ dimensions', () => {
      const feel = DIMENSION_REGISTRY.filter(d => d.layer === 'feel');
      expect(feel).toHaveLength(21);
    });

    it('has 10 functional_ dimensions', () => {
      const functional = DIMENSION_REGISTRY.filter(d => d.layer === 'functional');
      expect(functional).toHaveLength(10);
    });

    it('covers all properties in ALL_SCORING_DIMENSIONS', () => {
      const registryProps = DIMENSION_REGISTRY.map(d => d.property);
      for (const prop of ALL_SCORING_DIMENSIONS) {
        expect(registryProps).toContain(prop);
      }
    });

    it('every dimension has a complete rubric (low, mid, high)', () => {
      for (const dim of DIMENSION_REGISTRY) {
        expect(dim.rubric.low).toBeTruthy();
        expect(dim.rubric.mid).toBeTruthy();
        expect(dim.rubric.high).toBeTruthy();
      }
    });

    it('every dimension has a non-empty description', () => {
      for (const dim of DIMENSION_REGISTRY) {
        expect(dim.description.length).toBeGreaterThan(10);
      }
    });

    it('every dimension has a valid range', () => {
      for (const dim of DIMENSION_REGISTRY) {
        expect(dim.range.min).toBeLessThan(dim.range.max);
      }
    });

    it('feel_valence has range -1 to 1', () => {
      const valence = DIMENSION_REGISTRY.find(d => d.property === 'feel_valence');
      expect(valence).toBeDefined();
      expect(valence!.range).toEqual({ min: -1, max: 1 });
    });

    it('all other dimensions have range 0 to 1', () => {
      for (const dim of DIMENSION_REGISTRY) {
        if (dim.property === 'feel_valence') continue;
        expect(dim.range).toEqual({ min: 0, max: 1 });
      }
    });

    it('has no duplicate property names', () => {
      const props = DIMENSION_REGISTRY.map(d => d.property);
      expect(new Set(props).size).toBe(props.length);
    });

    it('feel_ dimensions match FEEL_DIMENSION_PROPERTIES', () => {
      const feelProps = DIMENSION_REGISTRY
        .filter(d => d.layer === 'feel')
        .map(d => d.property);
      expect(feelProps).toEqual(expect.arrayContaining([...FEEL_DIMENSION_PROPERTIES]));
      expect(feelProps).toHaveLength(FEEL_DIMENSION_PROPERTIES.length);
    });

    it('functional_ dimensions match FUNCTIONAL_DIMENSION_PROPERTIES', () => {
      const funcProps = DIMENSION_REGISTRY
        .filter(d => d.layer === 'functional')
        .map(d => d.property);
      expect(funcProps).toEqual(expect.arrayContaining([...FUNCTIONAL_DIMENSION_PROPERTIES]));
      expect(funcProps).toHaveLength(FUNCTIONAL_DIMENSION_PROPERTIES.length);
    });
  });

  // ── parseScore ────────────────────────────────────────────────────

  describe('parseScore', () => {
    it('parses valid 0-1 value', () => {
      expect(parseScore('0.75', { min: 0, max: 1 })).toBe(0.75);
    });

    it('parses boundary values', () => {
      expect(parseScore('0', { min: 0, max: 1 })).toBe(0);
      expect(parseScore('1', { min: 0, max: 1 })).toBe(1);
      expect(parseScore('-1', { min: -1, max: 1 })).toBe(-1);
    });

    it('returns null for out-of-range values', () => {
      expect(parseScore('1.5', { min: 0, max: 1 })).toBeNull();
      expect(parseScore('-0.1', { min: 0, max: 1 })).toBeNull();
      expect(parseScore('-2', { min: -1, max: 1 })).toBeNull();
    });

    it('returns null for non-numeric text', () => {
      expect(parseScore('hello', { min: 0, max: 1 })).toBeNull();
      expect(parseScore('', { min: 0, max: 1 })).toBeNull();
    });

    it('trims whitespace', () => {
      expect(parseScore('  0.5  ', { min: 0, max: 1 })).toBe(0.5);
      expect(parseScore('\n0.7\n', { min: 0, max: 1 })).toBe(0.7);
    });

    it('handles -1 to 1 range for feel_valence', () => {
      expect(parseScore('-0.5', { min: -1, max: 1 })).toBe(-0.5);
      expect(parseScore('0.5', { min: -1, max: 1 })).toBe(0.5);
    });
  });

  // ── buildScoringPrompt ─────────────────────────────────────────────

  describe('buildScoringPrompt', () => {
    const dimension = DIMENSION_REGISTRY.find(d => d.property === 'feel_happiness')!;

    it('includes dimension property name', () => {
      const prompt = buildScoringPrompt({ memory: SAMPLE_MEMORY, dimension });
      expect(prompt).toContain('feel_happiness');
    });

    it('includes rubric (low, mid, high)', () => {
      const prompt = buildScoringPrompt({ memory: SAMPLE_MEMORY, dimension });
      expect(prompt).toContain(dimension.rubric.low);
      expect(prompt).toContain(dimension.rubric.mid);
      expect(prompt).toContain(dimension.rubric.high);
    });

    it('includes memory content', () => {
      const prompt = buildScoringPrompt({ memory: SAMPLE_MEMORY, dimension });
      expect(prompt).toContain(SAMPLE_MEMORY.content);
    });

    it('includes content_type and created_at', () => {
      const prompt = buildScoringPrompt({ memory: SAMPLE_MEMORY, dimension });
      expect(prompt).toContain('journal_entry');
      expect(prompt).toContain('2026-03-07');
    });

    it('does NOT include tags', () => {
      const prompt = buildScoringPrompt({ memory: SAMPLE_MEMORY, dimension });
      expect(prompt.toLowerCase()).not.toContain('tags:');
    });

    it('includes context when provided', () => {
      const context: ScoringContext = {
        relationship_observations: ['Related to project completion theme'],
        nearest_neighbor_scores: { feel_happiness: 0.9 },
        collection_averages: { feel_happiness: 0.4 },
      };

      const prompt = buildScoringPrompt({ memory: SAMPLE_MEMORY, dimension, context });
      expect(prompt).toContain('Related to project completion theme');
      expect(prompt).toContain('0.90');
      expect(prompt).toContain('0.40');
    });

    it('omits context section when no context provided', () => {
      const prompt = buildScoringPrompt({ memory: SAMPLE_MEMORY, dimension });
      expect(prompt).not.toContain('CONTEXT:');
    });

    it('uses -1 to 1 range for feel_valence', () => {
      const valence = DIMENSION_REGISTRY.find(d => d.property === 'feel_valence')!;
      const prompt = buildScoringPrompt({ memory: SAMPLE_MEMORY, dimension: valence });
      expect(prompt).toContain('between -1 and 1');
    });

    it('uses 0 to 1 range for non-valence dimensions', () => {
      const prompt = buildScoringPrompt({ memory: SAMPLE_MEMORY, dimension });
      expect(prompt).toContain('between 0 and 1');
    });
  });

  // ── scoreDimension ─────────────────────────────────────────────────

  describe('scoreDimension', () => {
    it('returns valid score from sub-LLM response', async () => {
      const subLlm = createMockSubLlm('0.85');
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });
      const dimension = DIMENSION_REGISTRY.find(d => d.property === 'feel_happiness')!;

      const result = await service.scoreDimension({
        memory: SAMPLE_MEMORY,
        dimension,
      });

      expect(result.property).toBe('feel_happiness');
      expect(result.score).toBe(0.85);
    });

    it('returns null on invalid sub-LLM response', async () => {
      const subLlm = createMockSubLlm('I think this is about 0.7');
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });
      const dimension = DIMENSION_REGISTRY.find(d => d.property === 'feel_happiness')!;

      const result = await service.scoreDimension({
        memory: SAMPLE_MEMORY,
        dimension,
      });

      expect(result.property).toBe('feel_happiness');
      expect(result.score).toBeNull();
    });

    it('returns null on sub-LLM error (does not throw)', async () => {
      const subLlm = createMockSubLlm();
      subLlm.score.mockRejectedValue(new Error('api_error'));
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });
      const dimension = DIMENSION_REGISTRY.find(d => d.property === 'feel_happiness')!;

      const result = await service.scoreDimension({
        memory: SAMPLE_MEMORY,
        dimension,
      });

      expect(result.property).toBe('feel_happiness');
      expect(result.score).toBeNull();
    });

    it('validates feel_valence score in -1 to 1 range', async () => {
      const subLlm = createMockSubLlm('-0.7');
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });
      const dimension = DIMENSION_REGISTRY.find(d => d.property === 'feel_valence')!;

      const result = await service.scoreDimension({
        memory: SAMPLE_MEMORY,
        dimension,
      });

      expect(result.score).toBe(-0.7);
    });

    it('rejects out-of-range feel_valence', async () => {
      const subLlm = createMockSubLlm('-1.5');
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });
      const dimension = DIMENSION_REGISTRY.find(d => d.property === 'feel_valence')!;

      const result = await service.scoreDimension({
        memory: SAMPLE_MEMORY,
        dimension,
      });

      expect(result.score).toBeNull();
    });
  });

  // ── buildBatchScoringPrompt ──────────────────────────────────────────

  describe('buildBatchScoringPrompt', () => {
    it('includes memory content', () => {
      const prompt = buildBatchScoringPrompt(SAMPLE_MEMORY);
      expect(prompt).toContain(SAMPLE_MEMORY.content);
    });

    it('includes all 31 dimension property names', () => {
      const prompt = buildBatchScoringPrompt(SAMPLE_MEMORY);
      for (const dim of DIMENSION_REGISTRY) {
        expect(prompt).toContain(dim.property);
      }
    });

    it('includes rubrics for each dimension', () => {
      const prompt = buildBatchScoringPrompt(SAMPLE_MEMORY);
      for (const dim of DIMENSION_REGISTRY) {
        expect(prompt).toContain(dim.rubric.low);
      }
    });

    it('shows -1 to 1 range for feel_valence', () => {
      const prompt = buildBatchScoringPrompt(SAMPLE_MEMORY);
      expect(prompt).toContain('feel_valence (-1 to 1)');
    });

    it('includes context when provided', () => {
      const context: ScoringContext = {
        relationship_observations: ['Test observation'],
      };
      const prompt = buildBatchScoringPrompt(SAMPLE_MEMORY, context);
      expect(prompt).toContain('Test observation');
    });

    it('asks for JSON response', () => {
      const prompt = buildBatchScoringPrompt(SAMPLE_MEMORY);
      expect(prompt).toContain('JSON object');
    });
  });

  // ── parseBatchScores ────────────────────────────────────────────────

  describe('parseBatchScores', () => {
    it('parses valid JSON response', () => {
      const scores: Record<string, number> = {};
      for (const dim of DIMENSION_REGISTRY) {
        scores[dim.property] = 0.5;
      }
      const results = parseBatchScores(JSON.stringify(scores));
      for (const dim of DIMENSION_REGISTRY) {
        expect(results[dim.property]).toBe(0.5);
      }
    });

    it('handles markdown code-fenced JSON', () => {
      const scores: Record<string, number> = {};
      for (const dim of DIMENSION_REGISTRY) {
        scores[dim.property] = 0.7;
      }
      const response = '```json\n' + JSON.stringify(scores) + '\n```';
      const results = parseBatchScores(response);
      expect(results['feel_emotional_significance']).toBe(0.7);
    });

    it('returns null for missing dimensions', () => {
      const results = parseBatchScores('{"feel_emotional_significance": 0.5}');
      expect(results['feel_emotional_significance']).toBe(0.5);
      expect(results['feel_happiness']).toBeNull();
    });

    it('returns null for out-of-range values', () => {
      const results = parseBatchScores('{"feel_happiness": 1.5, "feel_valence": -2}');
      expect(results['feel_happiness']).toBeNull();
      expect(results['feel_valence']).toBeNull();
    });

    it('accepts feel_valence in -1 to 1 range', () => {
      const results = parseBatchScores('{"feel_valence": -0.7}');
      expect(results['feel_valence']).toBe(-0.7);
    });

    it('returns all nulls for invalid JSON', () => {
      const results = parseBatchScores('not json at all');
      for (const dim of DIMENSION_REGISTRY) {
        expect(results[dim.property]).toBeNull();
      }
    });

    it('returns all nulls for empty response', () => {
      const results = parseBatchScores('');
      expect(Object.keys(results)).toHaveLength(31);
      for (const dim of DIMENSION_REGISTRY) {
        expect(results[dim.property]).toBeNull();
      }
    });
  });

  // ── scoreAllDimensions ──────────────────────────────────────────────

  describe('scoreAllDimensions', () => {
    function buildMockBatchResponse(score: number = 0.5): string {
      const scores: Record<string, number> = {};
      for (const dim of DIMENSION_REGISTRY) {
        scores[dim.property] = dim.property === 'feel_valence' ? score * 2 - 1 : score;
      }
      return JSON.stringify(scores);
    }

    it('returns results for all 31 dimensions', async () => {
      const subLlm = createMockSubLlm(buildMockBatchResponse());
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });

      const results = await service.scoreAllDimensions(SAMPLE_MEMORY);

      expect(Object.keys(results)).toHaveLength(31);
      for (const dim of ALL_SCORING_DIMENSIONS) {
        expect(results[dim]).toBeDefined();
      }
    });

    it('calls sub-LLM exactly once (batch)', async () => {
      const subLlm = createMockSubLlm(buildMockBatchResponse());
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });

      await service.scoreAllDimensions(SAMPLE_MEMORY);

      expect(subLlm.score).toHaveBeenCalledTimes(1);
    });

    it('requests maxTokens 1024 for batch call', async () => {
      const subLlm = createMockSubLlm(buildMockBatchResponse());
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });

      await service.scoreAllDimensions(SAMPLE_MEMORY);

      expect(subLlm.score).toHaveBeenCalledWith(expect.any(String), { maxTokens: 1024 });
    });

    it('handles partial results (some dimensions missing from response)', async () => {
      // Only return a few dimensions
      const partial = JSON.stringify({
        feel_emotional_significance: 0.8,
        feel_happiness: 0.9,
      });
      const subLlm = createMockSubLlm(partial);
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });

      const results = await service.scoreAllDimensions(SAMPLE_MEMORY);

      expect(results['feel_emotional_significance']).toBe(0.8);
      expect(results['feel_happiness']).toBe(0.9);
      // Missing dimensions should be null
      expect(results['feel_sadness']).toBeNull();
      expect(Object.keys(results)).toHaveLength(31);
    });

    it('returns all nulls on sub-LLM error', async () => {
      const subLlm = createMockSubLlm();
      subLlm.score.mockRejectedValue(new Error('api_error'));
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });

      const results = await service.scoreAllDimensions(SAMPLE_MEMORY);

      expect(Object.keys(results)).toHaveLength(31);
      for (const value of Object.values(results)) {
        expect(value).toBeNull();
      }
    });

    it('passes context to the batch prompt', async () => {
      const subLlm = createMockSubLlm(buildMockBatchResponse());
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });
      const context: ScoringContext = {
        relationship_observations: ['Test observation'],
      };

      await service.scoreAllDimensions(SAMPLE_MEMORY, context);

      expect(subLlm.score.mock.calls[0][0]).toContain('Test observation');
    });
  });

  // ── getDimension ────────────────────────────────────────────────────

  describe('getDimension', () => {
    it('returns dimension definition by property name', () => {
      const subLlm = createMockSubLlm();
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });

      const dim = service.getDimension('feel_happiness');
      expect(dim).toBeDefined();
      expect(dim!.property).toBe('feel_happiness');
      expect(dim!.layer).toBe('feel');
    });

    it('returns undefined for unknown property', () => {
      const subLlm = createMockSubLlm();
      const service = new EmotionalScoringService({ subLlm, logger: createMockLogger() });

      expect(service.getDimension('nonexistent')).toBeUndefined();
    });
  });
});
