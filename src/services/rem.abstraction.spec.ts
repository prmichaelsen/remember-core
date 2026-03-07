import {
  detectAbstractionCandidates,
  synthesizeAbstraction,
  buildAbstractionPrompt,
  runAbstractionPhase,
  DEFAULT_ABSTRACTION_CONFIG,
  type AbstractionCandidate,
  type AbstractionConfig,
} from './rem.abstraction.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeCluster(
  size: number,
  avgSimilarity = 0.85,
  properties: Record<string, any> = {},
) {
  const ids = Array.from({ length: size }, (_, i) => `mem-${i}`);
  const memories = ids.map(id => ({
    id,
    content: `Memory content for ${id}`,
    properties: { feel_happiness: 0.7, functional_salience: 0.5, ...properties },
  }));
  return { memory_ids: ids, memories, avg_similarity: avgSimilarity };
}

function createMockSubLlm(response: string) {
  return { score: jest.fn().mockResolvedValue(response) };
}

function createMockLogger() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// ─── detectAbstractionCandidates ──────────────────────────────────────────

describe('detectAbstractionCandidates', () => {
  const config = DEFAULT_ABSTRACTION_CONFIG;

  it('detects cluster with enough members and similarity', () => {
    const clusters = [makeCluster(5, 0.85)];
    const result = detectAbstractionCandidates(clusters, new Set(), config);
    expect(result).toHaveLength(1);
    expect(result[0].source_memory_ids).toHaveLength(5);
  });

  it('skips cluster below min_cluster_size', () => {
    const clusters = [makeCluster(3, 0.9)];
    const result = detectAbstractionCandidates(clusters, new Set(), config);
    expect(result).toHaveLength(0);
  });

  it('skips cluster below similarity_threshold', () => {
    const clusters = [makeCluster(6, 0.5)];
    const result = detectAbstractionCandidates(clusters, new Set(), config);
    expect(result).toHaveLength(0);
  });

  it('skips already-abstracted clusters', () => {
    const clusters = [makeCluster(5, 0.9)];
    const existingIds = new Set(clusters[0].memory_ids);
    const result = detectAbstractionCandidates(clusters, existingIds, config);
    expect(result).toHaveLength(0);
  });

  it('does not skip partially-abstracted clusters', () => {
    const clusters = [makeCluster(5, 0.9)];
    const existingIds = new Set(['mem-0', 'mem-1']); // only 2 of 5
    const result = detectAbstractionCandidates(clusters, existingIds, config);
    expect(result).toHaveLength(1);
  });

  it('builds emotional summary from memory properties', () => {
    const clusters = [makeCluster(5, 0.9, { feel_happiness: 0.8, feel_sadness: 0.3 })];
    const result = detectAbstractionCandidates(clusters, new Set(), config);
    expect(result[0].emotional_summary.feel_happiness).toBe(0.8);
    expect(result[0].emotional_summary.feel_sadness).toBe(0.3);
  });

  it('respects custom config thresholds', () => {
    const customConfig: AbstractionConfig = { min_cluster_size: 3, similarity_threshold: 0.5 };
    const clusters = [makeCluster(3, 0.6)];
    const result = detectAbstractionCandidates(clusters, new Set(), customConfig);
    expect(result).toHaveLength(1);
  });

  it('includes source_contents from memories', () => {
    const clusters = [makeCluster(5, 0.9)];
    const result = detectAbstractionCandidates(clusters, new Set(), config);
    expect(result[0].source_contents).toHaveLength(5);
    expect(result[0].source_contents[0]).toContain('mem-0');
  });
});

// ─── buildAbstractionPrompt ───────────────────────────────────────────────

describe('buildAbstractionPrompt', () => {
  it('includes source memory count', () => {
    const candidate: AbstractionCandidate = {
      source_memory_ids: ['a', 'b', 'c', 'd', 'e'],
      source_contents: ['Content A', 'Content B', 'Content C', 'Content D', 'Content E'],
      emotional_summary: { feel_happiness: 0.8 },
    };
    const prompt = buildAbstractionPrompt(candidate);
    expect(prompt).toContain('5 related memories');
  });

  it('includes emotional profile when scores are above threshold', () => {
    const candidate: AbstractionCandidate = {
      source_memory_ids: ['a'],
      source_contents: ['Content'],
      emotional_summary: { feel_happiness: 0.8, feel_sadness: 0.1 },
    };
    const prompt = buildAbstractionPrompt(candidate);
    expect(prompt).toContain('feel_happiness');
    expect(prompt).not.toContain('feel_sadness'); // below 0.3 threshold
  });

  it('truncates long content to 200 chars per memory', () => {
    const longContent = 'x'.repeat(300);
    const candidate: AbstractionCandidate = {
      source_memory_ids: ['a'],
      source_contents: [longContent],
      emotional_summary: {},
    };
    const prompt = buildAbstractionPrompt(candidate);
    // Content in the prompt should be truncated to 200 chars, not full 300
    expect(prompt).not.toContain('x'.repeat(300));
    expect(prompt).toContain('x'.repeat(200));
  });
});

// ─── synthesizeAbstraction ────────────────────────────────────────────────

describe('synthesizeAbstraction', () => {
  const candidate: AbstractionCandidate = {
    source_memory_ids: ['a', 'b', 'c', 'd', 'e'],
    source_contents: ['A', 'B', 'C', 'D', 'E'],
    emotional_summary: { feel_happiness: 0.7 },
  };

  it('returns synthesis from valid Haiku response', async () => {
    const subLlm = createMockSubLlm(JSON.stringify({
      content: 'Recurring pattern: weekly coffee meetings',
      observation: 'Social routine that provides comfort',
      abstraction_type: 'recurring_pattern',
    }));

    const result = await synthesizeAbstraction(candidate, subLlm);
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Recurring pattern: weekly coffee meetings');
    expect(result!.observation).toBe('Social routine that provides comfort');
    expect(result!.abstraction_type).toBe('recurring_pattern');
  });

  it('returns null on malformed JSON', async () => {
    const subLlm = createMockSubLlm('not valid json');
    const logger = createMockLogger();
    const result = await synthesizeAbstraction(candidate, subLlm, logger);
    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns null when response missing required fields', async () => {
    const subLlm = createMockSubLlm(JSON.stringify({ content: 'partial' }));
    const logger = createMockLogger();
    const result = await synthesizeAbstraction(candidate, subLlm, logger);
    expect(result).toBeNull();
  });

  it('defaults invalid abstraction_type to recurring_pattern', async () => {
    const subLlm = createMockSubLlm(JSON.stringify({
      content: 'Test',
      observation: 'Test obs',
      abstraction_type: 'invalid_type',
    }));
    const result = await synthesizeAbstraction(candidate, subLlm);
    expect(result!.abstraction_type).toBe('recurring_pattern');
  });

  it('returns null when sub-LLM throws', async () => {
    const subLlm = createMockSubLlm('');
    subLlm.score.mockRejectedValue(new Error('api error'));
    const result = await synthesizeAbstraction(candidate, subLlm);
    expect(result).toBeNull();
  });
});

// ─── runAbstractionPhase ──────────────────────────────────────────────────

describe('runAbstractionPhase', () => {
  it('returns empty results when no candidates', async () => {
    const clusters = [makeCluster(2)]; // below threshold
    const deps = { subLlm: createMockSubLlm(''), logger: createMockLogger() };

    const { results, stats } = await runAbstractionPhase(clusters, new Set(), deps);
    expect(results).toHaveLength(0);
    expect(stats.candidates_found).toBe(0);
  });

  it('synthesizes valid candidates', async () => {
    const clusters = [makeCluster(5, 0.9)];
    const subLlm = createMockSubLlm(JSON.stringify({
      content: 'Pattern detected',
      observation: 'Recurring theme',
      abstraction_type: 'thematic_collection',
    }));

    const { results, stats } = await runAbstractionPhase(clusters, new Set(), {
      subLlm,
      logger: createMockLogger(),
    });

    expect(results).toHaveLength(1);
    expect(stats.abstractions_created).toBe(1);
    expect(results[0].synthesis.content).toBe('Pattern detected');
    expect(results[0].candidate.source_memory_ids).toHaveLength(5);
  });

  it('skips candidates where synthesis fails', async () => {
    const clusters = [makeCluster(5, 0.9), makeCluster(6, 0.95)];
    const subLlm = createMockSubLlm('');
    subLlm.score
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(JSON.stringify({
        content: 'Second pattern',
        observation: 'Works',
        abstraction_type: 'identity_synthesis',
      }));

    const { results, stats } = await runAbstractionPhase(clusters, new Set(), {
      subLlm,
      logger: createMockLogger(),
    });

    expect(stats.candidates_found).toBe(2);
    expect(stats.abstractions_created).toBe(1);
    expect(stats.candidates_skipped).toBe(1);
    expect(results).toHaveLength(1);
  });

  it('respects custom config', async () => {
    const clusters = [makeCluster(3, 0.6)]; // would fail default config
    const subLlm = createMockSubLlm(JSON.stringify({
      content: 'Test',
      observation: 'Test',
      abstraction_type: 'recurring_pattern',
    }));

    const { stats } = await runAbstractionPhase(clusters, new Set(), {
      subLlm,
      config: { min_cluster_size: 3, similarity_threshold: 0.5 },
      logger: createMockLogger(),
    });

    expect(stats.candidates_found).toBe(1);
    expect(stats.abstractions_created).toBe(1);
  });

  it('result includes candidate for caller to create memory and relationships', async () => {
    const clusters = [makeCluster(5, 0.9)];
    const subLlm = createMockSubLlm(JSON.stringify({
      content: 'Abstract memory',
      observation: 'Observation text',
      abstraction_type: 'recurring_pattern',
    }));

    const { results } = await runAbstractionPhase(clusters, new Set(), {
      subLlm,
      logger: createMockLogger(),
    });

    expect(results[0].candidate.source_memory_ids).toHaveLength(5);
    expect(results[0].synthesis.content).toBe('Abstract memory');
    expect(results[0].synthesis.observation).toBe('Observation text');
    expect(results[0].synthesis.abstraction_type).toBe('recurring_pattern');
  });
});
