import { calculateMemorySignificance, type SignificanceInput } from './significance.service.js';
import type { CoreMoodMemory } from './mood.service.js';
import { NEUTRAL_STATE, createInitialMood } from './mood.service.js';

function makeMood(overrides: Partial<CoreMoodMemory['state']> = {}): CoreMoodMemory {
  const mood = createInitialMood('test-user');
  mood.state = { ...NEUTRAL_STATE, ...overrides };
  return mood;
}

function makeInput(overrides: Partial<SignificanceInput> = {}): SignificanceInput {
  return {
    base_significance: 0.5,
    ...overrides,
  };
}

describe('calculateMemorySignificance', () => {
  describe('no mood state', () => {
    it('returns base significance only when mood is null', () => {
      const result = calculateMemorySignificance(makeInput(), null);
      expect(result.total).toBe(0.5);
      expect(result.salience).toBe(0);
      expect(result.valence_intensity).toBe(0);
      expect(result.agency).toBe(0);
      expect(result.coherence_tension).toBe(0);
      expect(result.social_weight).toBe(0);
      expect(result.trust_flux).toBe(0);
    });

    it('returns base significance only when mood is undefined', () => {
      const result = calculateMemorySignificance(makeInput(), undefined);
      expect(result.total).toBe(0.5);
    });

    it('defaults base to 0.5 when not provided', () => {
      const result = calculateMemorySignificance({}, null);
      expect(result.total).toBe(0.5);
    });
  });

  describe('salience modifier', () => {
    it('arousal=1.0 adds 0.2', () => {
      const mood = makeMood({ arousal: 1.0 });
      const result = calculateMemorySignificance(makeInput({ base_significance: 0 }), mood);
      expect(result.salience).toBeCloseTo(0.2);
    });

    it('arousal=0.5 adds 0.1', () => {
      const mood = makeMood({ arousal: 0.5 });
      const result = calculateMemorySignificance(makeInput({ base_significance: 0 }), mood);
      expect(result.salience).toBeCloseTo(0.1);
    });

    it('arousal=0.0 adds 0.0', () => {
      const mood = makeMood({ arousal: 0.0 });
      const result = calculateMemorySignificance(makeInput({ base_significance: 0 }), mood);
      expect(result.salience).toBeCloseTo(0.0);
    });
  });

  describe('valenceIntensity modifier', () => {
    it('valence=1.0 adds 0.15', () => {
      const mood = makeMood({ valence: 1.0 });
      const result = calculateMemorySignificance(makeInput({ base_significance: 0 }), mood);
      expect(result.valence_intensity).toBeCloseTo(0.15);
    });

    it('valence=-1.0 adds 0.15 (absolute value)', () => {
      const mood = makeMood({ valence: -1.0 });
      const result = calculateMemorySignificance(makeInput({ base_significance: 0 }), mood);
      expect(result.valence_intensity).toBeCloseTo(0.15);
    });

    it('valence=0.0 adds 0.0', () => {
      const mood = makeMood({ valence: 0.0 });
      const result = calculateMemorySignificance(makeInput({ base_significance: 0 }), mood);
      expect(result.valence_intensity).toBeCloseTo(0.0);
    });
  });

  describe('agency modifier', () => {
    it("triggered_by='self' adds 0.1", () => {
      const mood = makeMood();
      const result = calculateMemorySignificance(makeInput({ base_significance: 0, triggered_by: 'self' }), mood);
      expect(result.agency).toBeCloseTo(0.1);
    });

    it("triggered_by='user' adds 0.0", () => {
      const mood = makeMood();
      const result = calculateMemorySignificance(makeInput({ base_significance: 0, triggered_by: 'user' }), mood);
      expect(result.agency).toBeCloseTo(0.0);
    });

    it('triggered_by=undefined adds 0.0', () => {
      const mood = makeMood();
      const result = calculateMemorySignificance(makeInput({ base_significance: 0 }), mood);
      expect(result.agency).toBeCloseTo(0.0);
    });
  });

  describe('coherenceTension modifier', () => {
    it('coherence=0.0 adds 0.15 (max tension)', () => {
      const mood = makeMood({ coherence: 0.0 });
      const result = calculateMemorySignificance(makeInput({ base_significance: 0 }), mood);
      expect(result.coherence_tension).toBeCloseTo(0.15);
    });

    it('coherence=1.0 adds 0.0 (no tension)', () => {
      const mood = makeMood({ coherence: 1.0 });
      const result = calculateMemorySignificance(makeInput({ base_significance: 0 }), mood);
      expect(result.coherence_tension).toBeCloseTo(0.0);
    });

    it('coherence=0.5 adds 0.075', () => {
      const mood = makeMood({ coherence: 0.5 });
      const result = calculateMemorySignificance(makeInput({ base_significance: 0 }), mood);
      expect(result.coherence_tension).toBeCloseTo(0.075);
    });
  });

  describe('socialWeight modifier', () => {
    it('involves_other_users=true, social_warmth=1.0 adds 0.1', () => {
      const mood = makeMood({ social_warmth: 1.0 });
      const result = calculateMemorySignificance(
        makeInput({ base_significance: 0, involves_other_users: true }),
        mood,
      );
      expect(result.social_weight).toBeCloseTo(0.1);
    });

    it('involves_other_users=true, social_warmth=0.5 adds 0.05', () => {
      const mood = makeMood({ social_warmth: 0.5 });
      const result = calculateMemorySignificance(
        makeInput({ base_significance: 0, involves_other_users: true }),
        mood,
      );
      expect(result.social_weight).toBeCloseTo(0.05);
    });

    it('involves_other_users=false adds 0.0 regardless of social_warmth', () => {
      const mood = makeMood({ social_warmth: 1.0 });
      const result = calculateMemorySignificance(
        makeInput({ base_significance: 0, involves_other_users: false }),
        mood,
      );
      expect(result.social_weight).toBeCloseTo(0.0);
    });
  });

  describe('trustFlux modifier', () => {
    it('involves_other_users=true, trust=0.5 adds 0.15 (peak flux)', () => {
      const mood = makeMood({ trust: 0.5 });
      const result = calculateMemorySignificance(
        makeInput({ base_significance: 0, involves_other_users: true }),
        mood,
      );
      expect(result.trust_flux).toBeCloseTo(0.15);
    });

    it('involves_other_users=true, trust=0.0 adds 0.0 (no flux)', () => {
      const mood = makeMood({ trust: 0.0 });
      const result = calculateMemorySignificance(
        makeInput({ base_significance: 0, involves_other_users: true }),
        mood,
      );
      expect(result.trust_flux).toBeCloseTo(0.0);
    });

    it('involves_other_users=true, trust=1.0 adds 0.0 (no flux)', () => {
      const mood = makeMood({ trust: 1.0 });
      const result = calculateMemorySignificance(
        makeInput({ base_significance: 0, involves_other_users: true }),
        mood,
      );
      expect(result.trust_flux).toBeCloseTo(0.0);
    });

    it('involves_other_users=true, trust=0.25 adds 0.075', () => {
      const mood = makeMood({ trust: 0.25 });
      const result = calculateMemorySignificance(
        makeInput({ base_significance: 0, involves_other_users: true }),
        mood,
      );
      expect(result.trust_flux).toBeCloseTo(0.075);
    });

    it('involves_other_users=true, trust=0.75 adds 0.075', () => {
      const mood = makeMood({ trust: 0.75 });
      const result = calculateMemorySignificance(
        makeInput({ base_significance: 0, involves_other_users: true }),
        mood,
      );
      expect(result.trust_flux).toBeCloseTo(0.075);
    });

    it('involves_other_users=false adds 0.0 regardless of trust', () => {
      const mood = makeMood({ trust: 0.5 });
      const result = calculateMemorySignificance(
        makeInput({ base_significance: 0, involves_other_users: false }),
        mood,
      );
      expect(result.trust_flux).toBeCloseTo(0.0);
    });
  });

  describe('clamping', () => {
    it('result clamped to max 1', () => {
      const mood = makeMood({ arousal: 1.0, valence: 1.0, coherence: 0.0 });
      const result = calculateMemorySignificance(
        makeInput({ base_significance: 0.9, triggered_by: 'self', involves_other_users: true }),
        mood,
      );
      expect(result.total).toBe(1);
    });

    it('result never goes below 0', () => {
      const result = calculateMemorySignificance(makeInput({ base_significance: -0.5 }), null);
      expect(result.total).toBe(0);
    });
  });

  describe('combined modifiers', () => {
    it('all modifiers contribute to total', () => {
      const mood = makeMood({
        arousal: 1.0,       // +0.2
        valence: 1.0,       // +0.15
        coherence: 0.0,     // +0.15
        social_warmth: 1.0, // +0.1 (when involves_other)
        trust: 0.5,         // +0.15 (when involves_other)
      });
      const result = calculateMemorySignificance(
        makeInput({
          base_significance: 0,
          triggered_by: 'self',       // +0.1
          involves_other_users: true,
        }),
        mood,
      );
      // 0 + 0.2 + 0.15 + 0.1 + 0.15 + 0.1 + 0.15 = 0.85
      expect(result.total).toBeCloseTo(0.85);
    });
  });
});
