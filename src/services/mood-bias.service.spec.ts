import { applyMoodBias, type BiasableMemory } from './mood-bias.service.js';
import type { CoreMoodMemory } from './mood.service.js';
import { NEUTRAL_STATE, createInitialMood } from './mood.service.js';

function makeMood(overrides: Partial<CoreMoodMemory['state']> = {}): CoreMoodMemory {
  const mood = createInitialMood('test-user');
  mood.state = { ...NEUTRAL_STATE, ...overrides };
  return mood;
}

function makeMemory(overrides: Partial<BiasableMemory> = {}): BiasableMemory {
  return {
    computed_weight: 1.0,
    weight: 0.5,
    trust: 0.5,
    content_type: 'note',
    tags: [],
    ...overrides,
  };
}

describe('applyMoodBias', () => {
  describe('low confidence bias (confidence < 0.3)', () => {
    const mood = makeMood({ confidence: 0.2 });

    it('boosts memories tagged failure by 1.3x', () => {
      const results = [makeMemory({ tags: ['failure'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.3);
    });

    it('boosts memories tagged lesson by 1.3x', () => {
      const results = [makeMemory({ tags: ['lesson'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.3);
    });

    it('does not boost when confidence >= 0.3', () => {
      const normalMood = makeMood({ confidence: 0.5 });
      const results = [makeMemory({ tags: ['failure'] })];
      const biased = applyMoodBias(results, normalMood);
      expect(biased[0].computed_weight).toBe(1.0);
    });

    it('does not boost untagged memories', () => {
      const results = [makeMemory()];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBe(1.0);
    });
  });

  describe('high social_warmth bias (social_warmth > 0.7)', () => {
    const mood = makeMood({ social_warmth: 0.8 });

    it('boosts conversation content_type by 1.2x', () => {
      const results = [makeMemory({ content_type: 'conversation' })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.2);
    });

    it('boosts memories tagged collaboration by 1.2x', () => {
      const results = [makeMemory({ tags: ['collaboration'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.2);
    });

    it('does not boost when social_warmth <= 0.7', () => {
      const normalMood = makeMood({ social_warmth: 0.5 });
      const results = [makeMemory({ tags: ['collaboration'] })];
      const biased = applyMoodBias(results, normalMood);
      expect(biased[0].computed_weight).toBe(1.0);
    });
  });

  describe('low coherence bias (coherence < 0.4)', () => {
    const mood = makeMood({ coherence: 0.3 });

    it('boosts memories tagged contradiction by 1.4x', () => {
      const results = [makeMemory({ tags: ['contradiction'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.4);
    });

    it('boosts memories tagged unresolved by 1.4x', () => {
      const results = [makeMemory({ tags: ['unresolved'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.4);
    });

    it('does not boost when coherence >= 0.4', () => {
      const normalMood = makeMood({ coherence: 0.5 });
      const results = [makeMemory({ tags: ['contradiction'] })];
      const biased = applyMoodBias(results, normalMood);
      expect(biased[0].computed_weight).toBe(1.0);
    });
  });

  describe('negative valence self-correction (valence < -0.5)', () => {
    const mood = makeMood({ valence: -0.7 });

    it('boosts positive high-weight memories by 1.15x', () => {
      const results = [makeMemory({ weight: 0.8, tags: ['positive'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.15);
    });

    it('requires BOTH weight > 0.7 AND positive tag', () => {
      const lowWeight = [makeMemory({ weight: 0.5, tags: ['positive'] })];
      expect(applyMoodBias(lowWeight, mood)[0].computed_weight).toBe(1.0);

      const noTag = [makeMemory({ weight: 0.9 })];
      expect(applyMoodBias(noTag, mood)[0].computed_weight).toBe(1.0);
    });

    it('does not boost when valence >= -0.5', () => {
      const normalMood = makeMood({ valence: -0.3 });
      const results = [makeMemory({ weight: 0.9, tags: ['positive'] })];
      const biased = applyMoodBias(results, normalMood);
      expect(biased[0].computed_weight).toBe(1.0);
    });
  });

  describe('low trust bias (trust < 0.3)', () => {
    const mood = makeMood({ trust: 0.2 });

    it('boosts memories tagged betrayal by 1.3x', () => {
      const results = [makeMemory({ tags: ['betrayal'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.3);
    });

    it('boosts memories tagged broken_promise by 1.3x', () => {
      const results = [makeMemory({ tags: ['broken_promise'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.3);
    });

    it('suppresses memories with trust > 0.7 by 0.7x', () => {
      const results = [makeMemory({ trust: 0.9 })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(0.7);
    });

    it('does not trigger when trust >= 0.3', () => {
      const normalMood = makeMood({ trust: 0.5 });
      const results = [makeMemory({ tags: ['betrayal'] })];
      const biased = applyMoodBias(results, normalMood);
      expect(biased[0].computed_weight).toBe(1.0);
    });
  });

  describe('high trust bias (trust > 0.8)', () => {
    const mood = makeMood({ trust: 0.9 });

    it('boosts memories tagged shared_experience by 1.2x', () => {
      const results = [makeMemory({ tags: ['shared_experience'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.2);
    });

    it('boosts memories tagged vulnerability by 1.2x', () => {
      const results = [makeMemory({ tags: ['vulnerability'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.2);
    });

    it('does not trigger when trust <= 0.8', () => {
      const normalMood = makeMood({ trust: 0.5 });
      const results = [makeMemory({ tags: ['shared_experience'] })];
      const biased = applyMoodBias(results, normalMood);
      expect(biased[0].computed_weight).toBe(1.0);
    });
  });

  describe('stacking and edge cases', () => {
    it('multiple bias rules stack multiplicatively', () => {
      // Low confidence + low coherence: failure tag gets 1.3x, contradiction tag gets 1.4x
      const mood = makeMood({ confidence: 0.1, coherence: 0.2 });
      const results = [makeMemory({ tags: ['failure', 'contradiction'] })];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBeCloseTo(1.3 * 1.4);
    });

    it('neutral mood produces no change', () => {
      const mood = makeMood(); // valence=0, others=0.5
      const results = [
        makeMemory({ computed_weight: 0.8, tags: ['failure'] }),
        makeMemory({ computed_weight: 0.5, tags: ['positive'] }),
        makeMemory({ computed_weight: 0.3, tags: ['betrayal'] }),
      ];
      const biased = applyMoodBias(results, mood);
      expect(biased[0].computed_weight).toBe(0.8);
      expect(biased[1].computed_weight).toBe(0.5);
      expect(biased[2].computed_weight).toBe(0.3);
    });

    it('returns results unchanged when mood is null', () => {
      const results = [makeMemory({ computed_weight: 0.7 })];
      const biased = applyMoodBias(results, null);
      expect(biased).toBe(results); // same reference
    });

    it('returns results unchanged when mood is undefined', () => {
      const results = [makeMemory({ computed_weight: 0.7 })];
      const biased = applyMoodBias(results, undefined);
      expect(biased).toBe(results);
    });

    it('results are re-sorted by updated computed_weight', () => {
      const mood = makeMood({ confidence: 0.1 }); // boosts failure by 1.3x
      const results = [
        makeMemory({ computed_weight: 0.5, tags: [] }),
        makeMemory({ computed_weight: 0.4, tags: ['failure'] }),
      ];
      const biased = applyMoodBias(results, mood);
      // 0.4 * 1.3 = 0.52, which should now be first
      expect(biased[0].computed_weight).toBeCloseTo(0.52);
      expect(biased[1].computed_weight).toBe(0.5);
    });

    it('empty results returns empty array', () => {
      const mood = makeMood({ confidence: 0.1 });
      expect(applyMoodBias([], mood)).toEqual([]);
    });
  });
});
