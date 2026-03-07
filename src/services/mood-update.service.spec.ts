import type { MoodState, Pressure, CoreMoodMemory } from './mood.service.js';
import {
  LEARNING_RATE,
  INERTIA,
  PRESSURE_REMOVAL_THRESHOLD,
  SIGNIFICANT_CHANGE_THRESHOLD,
  THRESHOLDS,
  aggregatePressures,
  driftDimension,
  driftMoodState,
  decayPressures,
  hasSignificantChange,
  checkThresholds,
  buildThresholdMemoryContent,
  runMoodUpdate,
} from './mood-update.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

const NEUTRAL: MoodState = {
  valence: 0, arousal: 0.5, confidence: 0.5,
  social_warmth: 0.5, coherence: 0.5, trust: 0.5,
};

function makePressure(overrides: Partial<Pressure> = {}): Pressure {
  return {
    source_memory_id: 'mem-1',
    direction: 'valence:-0.5',
    dimension: 'valence',
    magnitude: -0.5,
    reason: 'test pressure',
    created_at: new Date().toISOString(),
    decay_rate: 0.1,
    ...overrides,
  };
}

function makeMood(overrides: Partial<CoreMoodMemory> = {}): CoreMoodMemory {
  return {
    user_id: 'user-1',
    state: { ...NEUTRAL },
    color: '',
    dominant_emotion: '',
    reasoning: '',
    motivation: '',
    goal: '',
    purpose: '',
    pressures: [],
    personality_sketch: '',
    communication_style: '',
    emotional_baseline: '',
    interests: [],
    patterns: [],
    needs: [],
    evolution_notes: '',
    confidence_level: 0,
    last_updated: new Date().toISOString(),
    rem_cycles_since_shift: 0,
    ...overrides,
  };
}

// ─── Constants ────────────────────────────────────────────────────────────

describe('mood-update constants', () => {
  it('has expected learning rate and inertia', () => {
    expect(LEARNING_RATE).toBe(0.1);
    expect(INERTIA).toBe(0.7);
    // Effective drift rate = 0.1 * (1 - 0.7) = 0.03
    expect(LEARNING_RATE * (1 - INERTIA)).toBeCloseTo(0.03);
  });

  it('has pressure removal threshold of 0.05', () => {
    expect(PRESSURE_REMOVAL_THRESHOLD).toBe(0.05);
  });

  it('has significant change threshold of 0.1', () => {
    expect(SIGNIFICANT_CHANGE_THRESHOLD).toBe(0.1);
  });

  it('defines 6 threshold conditions', () => {
    expect(Object.keys(THRESHOLDS)).toHaveLength(6);
    expect(THRESHOLDS.existential_crisis).toBeDefined();
    expect(THRESHOLDS.depression_analog).toBeDefined();
    expect(THRESHOLDS.burnout_risk).toBeDefined();
    expect(THRESHOLDS.isolation).toBeDefined();
    expect(THRESHOLDS.trust_crisis).toBeDefined();
    expect(THRESHOLDS.over_trust).toBeDefined();
  });
});

// ─── aggregatePressures ───────────────────────────────────────────────────

describe('aggregatePressures', () => {
  it('returns zeroes for empty pressures', () => {
    const net = aggregatePressures([]);
    expect(net.valence).toBe(0);
    expect(net.trust).toBe(0);
  });

  it('sums pressures by dimension', () => {
    const pressures = [
      makePressure({ dimension: 'valence', magnitude: -0.3 }),
      makePressure({ dimension: 'valence', magnitude: 0.1 }),
      makePressure({ dimension: 'trust', magnitude: 0.5 }),
    ];
    const net = aggregatePressures(pressures);
    expect(net.valence).toBeCloseTo(-0.2);
    expect(net.trust).toBeCloseTo(0.5);
    expect(net.arousal).toBe(0);
  });

  it('ignores unknown dimensions', () => {
    const pressures = [
      makePressure({ dimension: 'unknown' as any, magnitude: 1.0 }),
    ];
    const net = aggregatePressures(pressures);
    expect(net.valence).toBe(0);
  });
});

// ─── driftDimension ───────────────────────────────────────────────────────

describe('driftDimension', () => {
  it('applies effective rate of pressure * 0.03', () => {
    const result = driftDimension(0.5, 1.0);
    // 0.5 + (1.0 * 0.1 * 0.3) = 0.5 + 0.03 = 0.53
    expect(result).toBeCloseTo(0.53);
  });

  it('drifts negatively for negative pressure', () => {
    const result = driftDimension(0.5, -1.0);
    expect(result).toBeCloseTo(0.47);
  });

  it('returns current value when pressure is zero', () => {
    expect(driftDimension(0.5, 0)).toBe(0.5);
  });
});

// ─── driftMoodState ───────────────────────────────────────────────────────

describe('driftMoodState', () => {
  it('drifts all dimensions', () => {
    const state: MoodState = { ...NEUTRAL };
    const pressures = {
      valence: 1.0, arousal: -1.0, confidence: 0,
      social_warmth: 0, coherence: 0, trust: 0,
    };
    const result = driftMoodState(state, pressures);
    expect(result.valence).toBeCloseTo(0.03);
    expect(result.arousal).toBeCloseTo(0.47);
    expect(result.confidence).toBe(0.5);
  });

  it('clamps valence to [-1, 1]', () => {
    const state: MoodState = { ...NEUTRAL, valence: 0.99 };
    const result = driftMoodState(state, { valence: 10 });
    expect(result.valence).toBe(1);
  });

  it('clamps valence at -1', () => {
    const state: MoodState = { ...NEUTRAL, valence: -0.99 };
    const result = driftMoodState(state, { valence: -10 });
    expect(result.valence).toBe(-1);
  });

  it('clamps other dimensions to [0, 1]', () => {
    const state: MoodState = { ...NEUTRAL, trust: 0.01 };
    const result = driftMoodState(state, { trust: -10 });
    expect(result.trust).toBe(0);

    const state2: MoodState = { ...NEUTRAL, arousal: 0.99 };
    const result2 = driftMoodState(state2, { arousal: 10 });
    expect(result2.arousal).toBe(1);
  });
});

// ─── decayPressures ───────────────────────────────────────────────────────

describe('decayPressures', () => {
  it('reduces magnitude by decay_rate', () => {
    const pressures = [makePressure({ magnitude: 1.0, decay_rate: 0.1 })];
    const result = decayPressures(pressures);
    expect(result[0].magnitude).toBeCloseTo(0.9);
  });

  it('removes pressures below threshold', () => {
    const pressures = [makePressure({ magnitude: 0.04, decay_rate: 0.1 })];
    const result = decayPressures(pressures);
    // 0.04 * 0.9 = 0.036 < 0.05 threshold
    expect(result).toHaveLength(0);
  });

  it('keeps pressures above threshold', () => {
    const pressures = [makePressure({ magnitude: 0.1, decay_rate: 0.1 })];
    const result = decayPressures(pressures);
    // 0.1 * 0.9 = 0.09 >= 0.05
    expect(result).toHaveLength(1);
  });

  it('handles negative magnitudes correctly', () => {
    const pressures = [makePressure({ magnitude: -1.0, decay_rate: 0.1 })];
    const result = decayPressures(pressures);
    expect(result[0].magnitude).toBeCloseTo(-0.9);
    expect(result).toHaveLength(1);
  });

  it('removes negative pressures below threshold', () => {
    const pressures = [makePressure({ magnitude: -0.04, decay_rate: 0.1 })];
    const result = decayPressures(pressures);
    expect(result).toHaveLength(0);
  });

  it('handles decay_rate = 0 (no decay)', () => {
    const pressures = [makePressure({ magnitude: 0.5, decay_rate: 0 })];
    const result = decayPressures(pressures);
    expect(result).toHaveLength(1);
    expect(result[0].magnitude).toBe(0.5);
  });

  it('handles decay_rate = 1 (instant removal)', () => {
    const pressures = [makePressure({ magnitude: 0.5, decay_rate: 1 })];
    const result = decayPressures(pressures);
    // 0.5 * (1 - 1) = 0, which is < 0.05
    expect(result).toHaveLength(0);
  });
});

// ─── hasSignificantChange ─────────────────────────────────────────────────

describe('hasSignificantChange', () => {
  it('returns false for identical states', () => {
    expect(hasSignificantChange(NEUTRAL, { ...NEUTRAL })).toBe(false);
  });

  it('returns false for small changes', () => {
    const newState = { ...NEUTRAL, valence: 0.09 };
    expect(hasSignificantChange(NEUTRAL, newState)).toBe(false);
  });

  it('returns true when any dimension shifts >= threshold', () => {
    const newState = { ...NEUTRAL, valence: 0.1 };
    expect(hasSignificantChange(NEUTRAL, newState)).toBe(true);
  });

  it('detects negative shifts', () => {
    const newState = { ...NEUTRAL, trust: 0.39 };
    // 0.5 - 0.39 = 0.11 >= 0.1
    expect(hasSignificantChange(NEUTRAL, newState)).toBe(true);
  });
});

// ─── checkThresholds ──────────────────────────────────────────────────────

describe('checkThresholds', () => {
  it('returns empty array for neutral state', () => {
    const flags = checkThresholds(NEUTRAL, 10);
    expect(flags).toHaveLength(0);
  });

  it('detects existential_crisis (coherence < 0.2 for 3+ cycles)', () => {
    const state: MoodState = { ...NEUTRAL, coherence: 0.15 };
    expect(checkThresholds(state, 2)).toHaveLength(0); // not enough cycles
    const flags = checkThresholds(state, 3);
    expect(flags).toHaveLength(1);
    expect(flags[0].name).toBe('existential_crisis');
  });

  it('detects depression_analog (valence < -0.7 for 3+ cycles)', () => {
    const state: MoodState = { ...NEUTRAL, valence: -0.8 };
    const flags = checkThresholds(state, 3);
    expect(flags.some(f => f.name === 'depression_analog')).toBe(true);
  });

  it('detects burnout_risk (arousal > 0.9 for 3+ cycles)', () => {
    const state: MoodState = { ...NEUTRAL, arousal: 0.95 };
    const flags = checkThresholds(state, 3);
    expect(flags.some(f => f.name === 'burnout_risk')).toBe(true);
  });

  it('detects isolation (social_warmth < 0.2 for 5+ cycles)', () => {
    const state: MoodState = { ...NEUTRAL, social_warmth: 0.1 };
    expect(checkThresholds(state, 4)).toHaveLength(0); // not enough cycles
    const flags = checkThresholds(state, 5);
    expect(flags.some(f => f.name === 'isolation')).toBe(true);
  });

  it('detects trust_crisis (trust < 0.15 for 3+ cycles)', () => {
    const state: MoodState = { ...NEUTRAL, trust: 0.1 };
    const flags = checkThresholds(state, 3);
    expect(flags.some(f => f.name === 'trust_crisis')).toBe(true);
  });

  it('detects over_trust (trust > 0.95 for 5+ cycles)', () => {
    const state: MoodState = { ...NEUTRAL, trust: 0.98 };
    const flags = checkThresholds(state, 5);
    expect(flags.some(f => f.name === 'over_trust')).toBe(true);
  });

  it('can flag multiple thresholds at once', () => {
    const state: MoodState = {
      valence: -0.8,
      arousal: 0.95,
      confidence: 0.5,
      social_warmth: 0.1,
      coherence: 0.1,
      trust: 0.1,
    };
    const flags = checkThresholds(state, 10);
    expect(flags.length).toBeGreaterThanOrEqual(5);
  });
});

// ─── buildThresholdMemoryContent ──────────────────────────────────────────

describe('buildThresholdMemoryContent', () => {
  it('builds content string without pressure', () => {
    const content = buildThresholdMemoryContent({
      name: 'existential_crisis',
      dimension: 'coherence',
      value: 0.15,
      cycles: 4,
    });
    expect(content).toContain('existential crisis');
    expect(content).toContain('4 consecutive REM cycles');
    expect(content).toContain('coherence: 0.15');
  });

  it('includes top pressure reason when provided', () => {
    const content = buildThresholdMemoryContent(
      { name: 'trust_crisis', dimension: 'trust', value: 0.1, cycles: 3 },
      makePressure({ reason: 'user broke a promise' }),
    );
    expect(content).toContain('Primary pressure: user broke a promise');
  });
});

// ─── runMoodUpdate (full pipeline) ────────────────────────────────────────

describe('runMoodUpdate', () => {
  it('drifts state by effective rate of 0.03 per unit pressure', () => {
    const mood = makeMood({
      pressures: [makePressure({ dimension: 'valence', magnitude: 1.0 })],
    });
    const result = runMoodUpdate(mood);
    expect(result.newState.valence).toBeCloseTo(0.03);
  });

  it('decays pressures', () => {
    const mood = makeMood({
      pressures: [makePressure({ magnitude: 1.0, decay_rate: 0.1 })],
    });
    const result = runMoodUpdate(mood);
    expect(result.decayedPressures[0].magnitude).toBeCloseTo(0.9);
  });

  it('removes decayed pressures below threshold', () => {
    const mood = makeMood({
      pressures: [makePressure({ magnitude: 0.04, decay_rate: 0.5 })],
    });
    const result = runMoodUpdate(mood);
    // 0.04 * 0.5 = 0.02 < 0.05
    expect(result.decayedPressures).toHaveLength(0);
  });

  it('resets rem_cycles_since_shift on significant change', () => {
    const mood = makeMood({
      pressures: [makePressure({ dimension: 'valence', magnitude: 10 })],
      rem_cycles_since_shift: 5,
    });
    const result = runMoodUpdate(mood);
    expect(result.significantChange).toBe(true);
    expect(result.remCyclesSinceShift).toBe(0);
  });

  it('increments rem_cycles_since_shift when no significant change', () => {
    const mood = makeMood({ rem_cycles_since_shift: 3 });
    const result = runMoodUpdate(mood);
    expect(result.significantChange).toBe(false);
    expect(result.remCyclesSinceShift).toBe(4);
  });

  it('detects threshold flags after sustained extreme state', () => {
    const mood = makeMood({
      state: { ...NEUTRAL, coherence: 0.15 },
      rem_cycles_since_shift: 3,
    });
    const result = runMoodUpdate(mood);
    // No significant change (pressure is 0), so cycles increment to 4
    expect(result.thresholdFlags.some(f => f.name === 'existential_crisis')).toBe(true);
  });

  it('returns empty threshold flags for healthy state', () => {
    const mood = makeMood();
    const result = runMoodUpdate(mood);
    expect(result.thresholdFlags).toHaveLength(0);
  });

  it('handles multiple pressures on same dimension', () => {
    const mood = makeMood({
      pressures: [
        makePressure({ dimension: 'trust', magnitude: 0.5 }),
        makePressure({ dimension: 'trust', magnitude: -0.3 }),
      ],
    });
    const result = runMoodUpdate(mood);
    // Net trust pressure = 0.2, drift = 0.2 * 0.03 = 0.006
    expect(result.newState.trust).toBeCloseTo(0.506);
  });
});

// ─── multi-cycle mood evolution ──────────────────────────────────────────

describe('multi-cycle mood evolution', () => {
  it('mood evolves sensibly over 5 cycles with consistent pressures', () => {
    let mood = makeMood({
      pressures: [
        makePressure({ dimension: 'valence', magnitude: -0.5, decay_rate: 0.1 }),
        makePressure({ dimension: 'trust', magnitude: -0.3, decay_rate: 0.05 }),
      ],
    });

    for (let i = 0; i < 5; i++) {
      const result = runMoodUpdate(mood);
      mood = makeMood({
        state: result.newState,
        pressures: result.decayedPressures,
        rem_cycles_since_shift: result.remCyclesSinceShift,
      });
    }

    expect(mood.state.valence).toBeLessThan(0);
    expect(mood.state.trust).toBeLessThan(0.5);
    expect(mood.state.arousal).toBe(0.5); // no pressure
  });

  it('mood stabilizes when pressures decay away', () => {
    let mood = makeMood({
      pressures: [
        makePressure({ dimension: 'arousal', magnitude: 0.8, decay_rate: 0.5 }),
      ],
    });

    const arousalValues: number[] = [];
    for (let i = 0; i < 20; i++) {
      const result = runMoodUpdate(mood);
      mood = makeMood({
        state: result.newState,
        pressures: result.decayedPressures,
        rem_cycles_since_shift: result.remCyclesSinceShift,
      });
      arousalValues.push(mood.state.arousal);
    }

    expect(mood.pressures).toHaveLength(0);
    const last = arousalValues[arousalValues.length - 1];
    const secondLast = arousalValues[arousalValues.length - 2];
    expect(Math.abs(last - secondLast)).toBeLessThan(0.001);
  });

  it('negative spiral self-corrects (mood should not run away indefinitely)', () => {
    let mood = makeMood({
      pressures: [
        makePressure({ dimension: 'valence', magnitude: -0.3, decay_rate: 0.2 }),
      ],
    });

    for (let i = 0; i < 50; i++) {
      const result = runMoodUpdate(mood);
      mood = makeMood({
        state: result.newState,
        pressures: result.decayedPressures,
        rem_cycles_since_shift: result.remCyclesSinceShift,
      });
    }

    expect(mood.state.valence).toBeGreaterThan(-1);
    expect(mood.pressures).toHaveLength(0);
  });

  it('mood responds to new pressures being added mid-simulation', () => {
    let mood = makeMood();

    for (let i = 0; i < 5; i++) {
      const result = runMoodUpdate(mood);
      mood = makeMood({
        state: result.newState,
        pressures: result.decayedPressures,
        rem_cycles_since_shift: result.remCyclesSinceShift,
      });
    }
    const midValence = mood.state.valence;

    // Add new pressure mid-run
    mood = makeMood({
      ...mood,
      pressures: [
        ...mood.pressures,
        makePressure({ dimension: 'valence', magnitude: 0.8, decay_rate: 0.1 }),
      ],
    });

    for (let i = 0; i < 5; i++) {
      const result = runMoodUpdate(mood);
      mood = makeMood({
        state: result.newState,
        pressures: result.decayedPressures,
        rem_cycles_since_shift: result.remCyclesSinceShift,
      });
    }

    expect(mood.state.valence).toBeGreaterThan(midValence);
  });

  it('all dimensions remain within valid ranges across all cycles', () => {
    let mood = makeMood({
      pressures: [
        makePressure({ dimension: 'valence', magnitude: -0.9, decay_rate: 0.05 }),
        makePressure({ dimension: 'arousal', magnitude: 0.9, decay_rate: 0.05 }),
        makePressure({ dimension: 'trust', magnitude: -0.7, decay_rate: 0.1 }),
        makePressure({ dimension: 'coherence', magnitude: -0.6, decay_rate: 0.08 }),
      ],
    });

    for (let i = 0; i < 30; i++) {
      const result = runMoodUpdate(mood);
      mood = makeMood({
        state: result.newState,
        pressures: result.decayedPressures,
        rem_cycles_since_shift: result.remCyclesSinceShift,
      });

      expect(mood.state.valence).toBeGreaterThanOrEqual(-1);
      expect(mood.state.valence).toBeLessThanOrEqual(1);
      expect(mood.state.arousal).toBeGreaterThanOrEqual(0);
      expect(mood.state.arousal).toBeLessThanOrEqual(1);
      expect(mood.state.confidence).toBeGreaterThanOrEqual(0);
      expect(mood.state.confidence).toBeLessThanOrEqual(1);
      expect(mood.state.social_warmth).toBeGreaterThanOrEqual(0);
      expect(mood.state.social_warmth).toBeLessThanOrEqual(1);
      expect(mood.state.coherence).toBeGreaterThanOrEqual(0);
      expect(mood.state.coherence).toBeLessThanOrEqual(1);
      expect(mood.state.trust).toBeGreaterThanOrEqual(0);
      expect(mood.state.trust).toBeLessThanOrEqual(1);
    }
  });
});
