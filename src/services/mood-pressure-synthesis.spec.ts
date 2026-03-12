import {
  synthesizePressuresFromDimensions,
  DIMENSION_MOOD_MAPPINGS,
  DEFAULT_PRESSURE_MAGNITUDE_SCALE,
  DEFAULT_DIMENSION_PRESSURE_DECAY,
  MIN_PRESSURE_MAGNITUDE,
} from './mood-pressure-synthesis.js';

describe('mood-pressure-synthesis', () => {
  describe('DIMENSION_MOOD_MAPPINGS', () => {
    it('has 6 mappings covering all mood dimensions', () => {
      expect(DIMENSION_MOOD_MAPPINGS).toHaveLength(6);
      const targets = DIMENSION_MOOD_MAPPINGS.map(m => m.target).sort();
      expect(targets).toEqual([
        'arousal', 'coherence', 'confidence', 'social_warmth', 'trust', 'valence',
      ]);
    });

    it('has tuned centers from ghost personality evaluation', () => {
      const byTarget = Object.fromEntries(DIMENSION_MOOD_MAPPINGS.map(m => [m.target, m]));
      expect(byTarget.trust.center).toBe(0.8);
      expect(byTarget.coherence.center).toBe(0.3);
      expect(byTarget.social_warmth.center).toBe(0.4);
      expect(byTarget.valence.center).toBe(0.5);
    });

    it('only inverts coherence (tension → coherence)', () => {
      const inverted = DIMENSION_MOOD_MAPPINGS.filter(m => m.invert);
      expect(inverted).toHaveLength(1);
      expect(inverted[0].target).toBe('coherence');
    });
  });

  describe('synthesizePressuresFromDimensions', () => {
    it('returns empty array for null/undefined dimensions', () => {
      const result = synthesizePressuresFromDimensions('mem-1', {});
      expect(result).toEqual([]);
    });

    it('returns empty array when all dimensions are at center values', () => {
      const result = synthesizePressuresFromDimensions('mem-1', {
        feel_valence: 0.5,
        feel_arousal: 0.5,
        feel_dominance: 0.5,
        functional_social_weight: 0.4,
        feel_coherence_tension: 0.3,
        functional_agency: 0.8,
      });
      expect(result).toEqual([]);
    });

    it('creates positive valence pressure from high feel_valence', () => {
      const result = synthesizePressuresFromDimensions('mem-1', {
        feel_valence: 0.8,
      });
      expect(result).toHaveLength(1);
      expect(result[0].dimension).toBe('valence');
      expect(result[0].magnitude).toBeGreaterThan(0);
      expect(result[0].source_memory_id).toBe('mem-1');
    });

    it('creates negative valence pressure from low feel_valence', () => {
      const result = synthesizePressuresFromDimensions('mem-1', {
        feel_valence: 0.2,
      });
      expect(result).toHaveLength(1);
      expect(result[0].dimension).toBe('valence');
      expect(result[0].magnitude).toBeLessThan(0);
    });

    it('inverts coherence tension — high tension creates negative coherence pressure', () => {
      const result = synthesizePressuresFromDimensions('mem-1', {
        feel_coherence_tension: 0.7,
      });
      expect(result).toHaveLength(1);
      expect(result[0].dimension).toBe('coherence');
      expect(result[0].magnitude).toBeLessThan(0);
    });

    it('trust requires agency > 0.8 for positive pressure', () => {
      // At center (0.8) — no pressure
      const atCenter = synthesizePressuresFromDimensions('mem-1', {
        functional_agency: 0.8,
      });
      expect(atCenter.filter(p => p.dimension === 'trust')).toHaveLength(0);

      // Above center — positive
      const above = synthesizePressuresFromDimensions('mem-1', {
        functional_agency: 0.95,
      });
      const trustPressures = above.filter(p => p.dimension === 'trust');
      expect(trustPressures).toHaveLength(1);
      expect(trustPressures[0].magnitude).toBeGreaterThan(0);

      // Below center — negative
      const below = synthesizePressuresFromDimensions('mem-1', {
        functional_agency: 0.5,
      });
      const negTrustPressures = below.filter(p => p.dimension === 'trust');
      expect(negTrustPressures).toHaveLength(1);
      expect(negTrustPressures[0].magnitude).toBeLessThan(0);
    });

    it('skips negligible pressures below MIN_PRESSURE_MAGNITUDE', () => {
      // A value very close to center should produce magnitude below threshold
      const result = synthesizePressuresFromDimensions('mem-1', {
        feel_valence: 0.5 + MIN_PRESSURE_MAGNITUDE / DEFAULT_PRESSURE_MAGNITUDE_SCALE * 0.5,
      });
      expect(result.filter(p => p.dimension === 'valence')).toHaveLength(0);
    });

    it('respects custom scale and decay rate', () => {
      const defaultResult = synthesizePressuresFromDimensions('mem-1', {
        feel_valence: 0.8,
      });
      const scaledResult = synthesizePressuresFromDimensions('mem-1', {
        feel_valence: 0.8,
      }, 0.6);

      // Double the scale should double the magnitude
      expect(Math.abs(scaledResult[0].magnitude)).toBeCloseTo(
        Math.abs(defaultResult[0].magnitude) * 2,
        5,
      );

      const customDecay = synthesizePressuresFromDimensions('mem-1', {
        feel_valence: 0.8,
      }, DEFAULT_PRESSURE_MAGNITUDE_SCALE, 0.5);
      expect(customDecay[0].decay_rate).toBe(0.5);
    });

    it('creates multiple pressures from multiple scored dimensions', () => {
      const result = synthesizePressuresFromDimensions('mem-1', {
        feel_valence: 0.8,        // above center → positive valence
        feel_arousal: 0.2,        // below center → negative arousal
        feel_dominance: 0.9,      // above center → positive confidence
        functional_social_weight: 0.7,  // above center → positive warmth
        feel_coherence_tension: 0.6,    // above center → negative coherence (inverted)
        functional_agency: 0.5,         // below center → negative trust
      });

      expect(result.length).toBe(6);

      const byDim = Object.fromEntries(result.map(p => [p.dimension, p]));
      expect(byDim.valence.magnitude).toBeGreaterThan(0);
      expect(byDim.arousal.magnitude).toBeLessThan(0);
      expect(byDim.confidence.magnitude).toBeGreaterThan(0);
      expect(byDim.social_warmth.magnitude).toBeGreaterThan(0);
      expect(byDim.coherence.magnitude).toBeLessThan(0);
      expect(byDim.trust.magnitude).toBeLessThan(0);
    });

    it('sets correct pressure metadata', () => {
      const result = synthesizePressuresFromDimensions('mem-42', {
        feel_valence: 0.8,
      });
      expect(result[0].source_memory_id).toBe('mem-42');
      expect(result[0].decay_rate).toBe(DEFAULT_DIMENSION_PRESSURE_DECAY);
      expect(result[0].reason).toContain('emotional valence');
      expect(result[0].direction).toMatch(/^valence:\+/);
      expect(result[0].created_at).toBeDefined();
    });
  });
});
