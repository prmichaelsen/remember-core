import { mergeScores } from './selective-reevaluation.js';
import { ALL_SCORING_DIMENSIONS } from '../../database/weaviate/v2-collections.js';

describe('mergeScores', () => {
  it('preserves existing scores when no new partial scores', () => {
    const existing = { feel_happiness: 0.8, feel_sadness: 0.2 };
    const result = mergeScores(existing, {});
    expect(result.feel_happiness).toBe(0.8);
    expect(result.feel_sadness).toBe(0.2);
  });

  it('overwrites existing scores with new partial scores', () => {
    const existing = { feel_happiness: 0.8 };
    const result = mergeScores(existing, { feel_happiness: 0.5 });
    expect(result.feel_happiness).toBe(0.5);
  });

  it('returns null for unscored dimensions', () => {
    const result = mergeScores({}, {});
    for (const dim of ALL_SCORING_DIMENSIONS) {
      expect(result[dim]).toBeNull();
    }
  });

  it('includes all 31 scoring dimensions in result', () => {
    const result = mergeScores({}, {});
    expect(Object.keys(result)).toHaveLength(ALL_SCORING_DIMENSIONS.length);
  });
});
