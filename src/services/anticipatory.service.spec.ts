import {
  createAnticipatoryPressures,
  buildPatternDetectionPrompt,
  parsePatternResponse,
  MAX_ANTICIPATORY_PRESSURES,
  DEFAULT_ANTICIPATORY_DECAY,
  type DetectedPattern,
  type RecentMemory,
} from './anticipatory.service.js';

function makePattern(overrides: Partial<DetectedPattern> = {}): DetectedPattern {
  return {
    memory_ids: ['m1', 'm2'],
    pattern_description: 'repeated theme',
    projection: 'will continue',
    anticipated_valence: -0.1,
    dimension: 'valence',
    magnitude: -0.1,
    ...overrides,
  };
}

describe('createAnticipatoryPressures', () => {
  describe('pressure creation', () => {
    it('creates pressure with correct dimension', () => {
      const pressures = createAnticipatoryPressures([makePattern({ dimension: 'trust' })]);
      expect(pressures).toHaveLength(1);
      expect(pressures[0].dimension).toBe('trust');
    });

    it('magnitude in expected range (-0.15 to +0.15)', () => {
      const pressures = createAnticipatoryPressures([makePattern({ magnitude: -0.1 })]);
      expect(pressures[0].magnitude).toBe(-0.1);
    });

    it('clamps magnitude to -0.15', () => {
      const pressures = createAnticipatoryPressures([makePattern({ magnitude: -0.5 })]);
      expect(pressures[0].magnitude).toBe(-0.15);
    });

    it('clamps magnitude to 0.15', () => {
      const pressures = createAnticipatoryPressures([makePattern({ magnitude: 0.5 })]);
      expect(pressures[0].magnitude).toBe(0.15);
    });

    it('decay_rate is DEFAULT_ANTICIPATORY_DECAY', () => {
      const pressures = createAnticipatoryPressures([makePattern()]);
      expect(pressures[0].decay_rate).toBe(DEFAULT_ANTICIPATORY_DECAY);
    });

    it('reason describes the anticipation', () => {
      const pressures = createAnticipatoryPressures([
        makePattern({ projection: 'user may disengage' }),
      ]);
      expect(pressures[0].reason).toBe('anticipating: user may disengage');
    });

    it('source_memory_id links to most recent pattern memory', () => {
      const pressures = createAnticipatoryPressures([
        makePattern({ memory_ids: ['m1', 'm2', 'm3'] }),
      ]);
      expect(pressures[0].source_memory_id).toBe('m3');
    });

    it('direction includes dimension and magnitude', () => {
      const pressures = createAnticipatoryPressures([
        makePattern({ dimension: 'valence', magnitude: -0.1 }),
      ]);
      expect(pressures[0].direction).toBe('valence:-0.10');
    });

    it('direction format for positive magnitude', () => {
      const pressures = createAnticipatoryPressures([
        makePattern({ dimension: 'arousal', magnitude: 0.1 }),
      ]);
      expect(pressures[0].direction).toBe('arousal:+0.10');
    });
  });

  describe('caps and limits', () => {
    it('max 3 anticipatory pressures per cycle', () => {
      const patterns = [makePattern(), makePattern(), makePattern(), makePattern(), makePattern()];
      const pressures = createAnticipatoryPressures(patterns);
      expect(pressures).toHaveLength(MAX_ANTICIPATORY_PRESSURES);
    });

    it('additional patterns beyond 3 are ignored', () => {
      const patterns = Array.from({ length: 5 }, (_, i) =>
        makePattern({ projection: `pattern-${i}` }),
      );
      const pressures = createAnticipatoryPressures(patterns);
      expect(pressures).toHaveLength(3);
      expect(pressures[2].reason).toBe('anticipating: pattern-2');
    });

    it('empty patterns returns empty array', () => {
      expect(createAnticipatoryPressures([])).toEqual([]);
    });
  });

  describe('valence direction', () => {
    it('negative historical outcomes produce negative magnitude', () => {
      const pressures = createAnticipatoryPressures([
        makePattern({ magnitude: -0.15 }),
      ]);
      expect(pressures[0].magnitude).toBeLessThan(0);
    });

    it('positive historical outcomes produce positive magnitude', () => {
      const pressures = createAnticipatoryPressures([
        makePattern({ magnitude: 0.12 }),
      ]);
      expect(pressures[0].magnitude).toBeGreaterThan(0);
    });
  });
});

describe('buildPatternDetectionPrompt', () => {
  it('includes all memories', () => {
    const memories: RecentMemory[] = [
      { id: 'm1', content: 'first memory', tags: ['test'], created_at: '2026-01-01T00:00:00Z' },
      { id: 'm2', content: 'second memory', tags: [], created_at: '2026-01-02T00:00:00Z' },
    ];
    const prompt = buildPatternDetectionPrompt(memories);
    expect(prompt).toContain('first memory');
    expect(prompt).toContain('second memory');
    expect(prompt).toContain('tags: test');
  });

  it('handles memories without tags', () => {
    const memories: RecentMemory[] = [
      { id: 'm1', content: 'no tags', created_at: '2026-01-01T00:00:00Z' },
    ];
    const prompt = buildPatternDetectionPrompt(memories);
    expect(prompt).toContain('no tags');
    expect(prompt).not.toContain('(tags:');
  });
});

describe('parsePatternResponse', () => {
  it('parses valid JSON array', () => {
    const response = JSON.stringify([{
      memory_ids: ['m1', 'm2'],
      pattern_description: 'recurring theme',
      projection: 'will happen again',
      anticipated_valence: -0.1,
      dimension: 'valence',
      magnitude: -0.1,
    }]);
    const patterns = parsePatternResponse(response);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].dimension).toBe('valence');
  });

  it('extracts JSON from markdown code blocks', () => {
    const response = '```json\n[{"memory_ids":["m1","m2"],"pattern_description":"x","projection":"y","anticipated_valence":-0.1,"dimension":"valence","magnitude":-0.1}]\n```';
    const patterns = parsePatternResponse(response);
    expect(patterns).toHaveLength(1);
  });

  it('returns empty on invalid JSON', () => {
    expect(parsePatternResponse('not json')).toEqual([]);
  });

  it('returns empty on empty response', () => {
    expect(parsePatternResponse('')).toEqual([]);
  });

  it('filters patterns with fewer than 2 memory_ids', () => {
    const response = JSON.stringify([{
      memory_ids: ['m1'],
      pattern_description: 'x',
      projection: 'y',
      anticipated_valence: -0.1,
      dimension: 'valence',
      magnitude: -0.1,
    }]);
    expect(parsePatternResponse(response)).toEqual([]);
  });

  it('filters patterns with invalid dimension', () => {
    const response = JSON.stringify([{
      memory_ids: ['m1', 'm2'],
      pattern_description: 'x',
      projection: 'y',
      anticipated_valence: -0.1,
      dimension: 'invalid_dim',
      magnitude: -0.1,
    }]);
    expect(parsePatternResponse(response)).toEqual([]);
  });

  it('returns empty array response as-is', () => {
    expect(parsePatternResponse('[]')).toEqual([]);
  });
});
