import type { MoodState, Pressure } from './mood.service.js';
import type { SubLlmProvider } from './emotional-scoring.service.js';
import {
  deriveMoodLabels,
  deriveMotivation,
  shouldUpdateGoal,
  shouldUpdatePurpose,
  FALLBACK_DERIVATION,
} from './narration.service.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const neutralState: MoodState = {
  valence: 0.2,
  arousal: 0.5,
  confidence: 0.6,
  social_warmth: 0.4,
  coherence: 0.8,
  trust: 0.7,
};

function makePressure(overrides: Partial<Pressure> = {}): Pressure {
  return {
    source_memory_id: 'mem-1',
    direction: 'valence:+0.3',
    dimension: 'valence',
    magnitude: 0.3,
    reason: 'a kind interaction',
    created_at: '2026-03-07T00:00:00Z',
    decay_rate: 0.1,
    ...overrides,
  };
}

const mockSubLlm: SubLlmProvider = {
  async score(_prompt: string): Promise<string> {
    return JSON.stringify({
      dominant_emotion: 'curious wariness',
      color: 'cautiously optimistic',
      reasoning: 'High coherence with moderate arousal suggests engaged alertness',
    });
  },
};

// ─── deriveMoodLabels ───────────────────────────────────────────────────────

describe('deriveMoodLabels', () => {
  it('returns valid MoodDerivation on success', async () => {
    const result = await deriveMoodLabels(
      neutralState,
      [makePressure()],
      'stay curious',
      'understand the user',
      'be helpful',
      mockSubLlm,
    );

    expect(result.dominant_emotion).toBe('curious wariness');
    expect(result.color).toBe('cautiously optimistic');
    expect(result.reasoning).toBe(
      'High coherence with moderate arousal suggests engaged alertness',
    );
  });

  it('handles malformed JSON gracefully (returns fallback)', async () => {
    const badLlm: SubLlmProvider = {
      async score() {
        return 'not json at all {{{';
      },
    };

    const result = await deriveMoodLabels(
      neutralState, [], '', '', '', badLlm,
    );

    expect(result).toEqual(FALLBACK_DERIVATION);
  });

  it('handles sub-LLM errors gracefully (returns fallback)', async () => {
    const errorLlm: SubLlmProvider = {
      async score() {
        throw new Error('rate limit exceeded');
      },
    };

    const result = await deriveMoodLabels(
      neutralState, [], '', '', '', errorLlm,
    );

    expect(result).toEqual(FALLBACK_DERIVATION);
  });

  it('handles partial JSON (missing fields)', async () => {
    const partialLlm: SubLlmProvider = {
      async score() {
        return JSON.stringify({ dominant_emotion: 'melancholy' });
      },
    };

    const result = await deriveMoodLabels(
      neutralState, [], '', '', '', partialLlm,
    );

    expect(result.dominant_emotion).toBe('melancholy');
    expect(result.color).toBe('');
    expect(result.reasoning).toBe('');
  });

  it('sorts pressures by abs(magnitude) and takes top 5', async () => {
    let capturedPrompt = '';
    const captureLlm: SubLlmProvider = {
      async score(prompt: string) {
        capturedPrompt = prompt;
        return JSON.stringify({
          dominant_emotion: 'test',
          color: 'test',
          reasoning: 'test',
        });
      },
    };

    const pressures: Pressure[] = [
      makePressure({ magnitude: 0.1, reason: 'weak-positive' }),
      makePressure({ magnitude: -0.9, reason: 'strong-negative' }),
      makePressure({ magnitude: 0.5, reason: 'mid-positive' }),
      makePressure({ magnitude: -0.3, reason: 'weak-negative' }),
      makePressure({ magnitude: 0.8, reason: 'strong-positive' }),
      makePressure({ magnitude: 0.7, reason: 'fairly-strong' }),
      makePressure({ magnitude: -0.05, reason: 'very-weak' }),
    ];

    await deriveMoodLabels(neutralState, pressures, '', '', '', captureLlm);

    // Top 5 by abs(magnitude): -0.9, 0.8, 0.7, 0.5, -0.3
    expect(capturedPrompt).toContain('strong-negative');
    expect(capturedPrompt).toContain('strong-positive');
    expect(capturedPrompt).toContain('fairly-strong');
    expect(capturedPrompt).toContain('mid-positive');
    expect(capturedPrompt).toContain('weak-negative');
    // These should NOT be included (rank 6 and 7)
    expect(capturedPrompt).not.toContain('weak-positive');
    expect(capturedPrompt).not.toContain('very-weak');
  });

  it('includes dimensional values in prompt', async () => {
    let capturedPrompt = '';
    const captureLlm: SubLlmProvider = {
      async score(prompt: string) {
        capturedPrompt = prompt;
        return JSON.stringify({
          dominant_emotion: 'x',
          color: 'x',
          reasoning: 'x',
        });
      },
    };

    await deriveMoodLabels(neutralState, [], 'my-motivation', 'my-goal', 'my-purpose', captureLlm);

    expect(capturedPrompt).toContain('valence: 0.20');
    expect(capturedPrompt).toContain('arousal: 0.50');
    expect(capturedPrompt).toContain('confidence: 0.60');
    expect(capturedPrompt).toContain('social_warmth: 0.40');
    expect(capturedPrompt).toContain('coherence: 0.80');
    expect(capturedPrompt).toContain('trust: 0.70');
    expect(capturedPrompt).toContain('my-motivation');
    expect(capturedPrompt).toContain('my-goal');
    expect(capturedPrompt).toContain('my-purpose');
  });
});

// ─── deriveMotivation ───────────────────────────────────────────────────────

describe('deriveMotivation', () => {
  it('returns motivation from top pressure', () => {
    const pressures = [
      makePressure({ magnitude: 0.2, reason: 'mild curiosity' }),
      makePressure({ magnitude: -0.8, reason: 'sharp disappointment' }),
      makePressure({ magnitude: 0.5, reason: 'growing trust' }),
    ];

    const result = deriveMotivation(pressures);
    expect(result).toBe('Driven by sharp disappointment');
  });

  it('returns empty string when no pressures', () => {
    expect(deriveMotivation([])).toBe('');
  });
});

// ─── shouldUpdateGoal ───────────────────────────────────────────────────────

describe('shouldUpdateGoal', () => {
  it('returns false when no pressures', () => {
    expect(shouldUpdateGoal('current goal', [])).toBe(false);
  });

  it('returns false when no strong pressures', () => {
    const pressures = [
      makePressure({ magnitude: 0.3 }),
      makePressure({ magnitude: -0.5 }),
      makePressure({ magnitude: 0.7 }),
    ];
    expect(shouldUpdateGoal('current goal', pressures)).toBe(false);
  });

  it('returns true when very strong pressure exists (abs > 0.7)', () => {
    const pressures = [
      makePressure({ magnitude: 0.3 }),
      makePressure({ magnitude: -0.85 }),
    ];
    expect(shouldUpdateGoal('current goal', pressures)).toBe(true);
  });
});

// ─── shouldUpdatePurpose ────────────────────────────────────────────────────

describe('shouldUpdatePurpose', () => {
  it('returns false when cycles < 10', () => {
    expect(shouldUpdatePurpose(0)).toBe(false);
    expect(shouldUpdatePurpose(5)).toBe(false);
    expect(shouldUpdatePurpose(9)).toBe(false);
  });

  it('returns true when cycles >= 10', () => {
    expect(shouldUpdatePurpose(10)).toBe(true);
    expect(shouldUpdatePurpose(25)).toBe(true);
  });
});

// ─── FALLBACK_DERIVATION ───────────────────────────────────────────────────

describe('FALLBACK_DERIVATION', () => {
  it('has all empty string fields', () => {
    expect(FALLBACK_DERIVATION).toEqual({
      dominant_emotion: '',
      color: '',
      reasoning: '',
    });
  });
});
