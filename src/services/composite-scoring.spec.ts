import {
  computeFeelSignificance,
  computeFunctionalSignificance,
  computeTotalSignificance,
  computeAllComposites,
  DEFAULT_WEIGHTS,
} from './composite-scoring.js';
import {
  FEEL_DIMENSION_PROPERTIES,
  FUNCTIONAL_DIMENSION_PROPERTIES,
} from '../database/weaviate/index.js';

// ─── computeFeelSignificance ─────────────────────────────────────────────

describe('computeFeelSignificance', () => {
  it('returns null when all dimensions are null/undefined', () => {
    expect(computeFeelSignificance({})).toBeNull();
    expect(computeFeelSignificance({ feel_happiness: null })).toBeNull();
  });

  it('computes weighted average with equal weights (single dimension)', () => {
    expect(computeFeelSignificance({ feel_happiness: 0.8 })).toBeCloseTo(0.8);
  });

  it('computes weighted average with equal weights (multiple dimensions)', () => {
    // avg(0.8, 0.2) = 0.5
    const result = computeFeelSignificance({ feel_happiness: 0.8, feel_sadness: 0.2 });
    expect(result).toBeCloseTo(0.5);
  });

  it('uses absolute value for feel_valence', () => {
    // valence = -0.8 → abs = 0.8; happiness = 0.6 → avg = 0.7
    const result = computeFeelSignificance({ feel_valence: -0.8, feel_happiness: 0.6 });
    expect(result).toBeCloseTo(0.7);
  });

  it('treats -1 valence same as +1 valence for significance', () => {
    const negResult = computeFeelSignificance({ feel_valence: -1 });
    const posResult = computeFeelSignificance({ feel_valence: 1 });
    expect(negResult).toBeCloseTo(posResult!);
  });

  it('excludes null dimensions from weighted sum (denominator adjusted)', () => {
    // Only happiness counts, sadness is null
    const result = computeFeelSignificance({
      feel_happiness: 0.8,
      feel_sadness: null,
    });
    expect(result).toBeCloseTo(0.8);
  });

  it('applies custom weights correctly', () => {
    // happiness weight=2, sadness weight=1 → (0.8*2 + 0.2*1) / (2+1) = 1.8/3 = 0.6
    const result = computeFeelSignificance(
      { feel_happiness: 0.8, feel_sadness: 0.2 },
      { feel_happiness: 2.0, feel_sadness: 1.0 },
    );
    expect(result).toBeCloseTo(0.6);
  });

  it('defaults missing weights to 1.0', () => {
    // feel_happiness has custom weight, feel_sadness missing → defaults to 1.0
    const result = computeFeelSignificance(
      { feel_happiness: 0.8, feel_sadness: 0.2 },
      { feel_happiness: 1.0 }, // feel_sadness not specified → defaults to 1.0
    );
    expect(result).toBeCloseTo(0.5); // (0.8 + 0.2) / 2
  });

  it('computes from all 21 dimensions when all provided', () => {
    const scores: Record<string, number> = {};
    for (const dim of FEEL_DIMENSION_PROPERTIES) {
      scores[dim] = 0.5;
    }
    const result = computeFeelSignificance(scores);
    expect(result).toBeCloseTo(0.5);
  });
});

// ─── computeFunctionalSignificance ───────────────────────────────────────

describe('computeFunctionalSignificance', () => {
  it('returns null when all dimensions are null/undefined', () => {
    expect(computeFunctionalSignificance({})).toBeNull();
  });

  it('computes weighted average (single dimension)', () => {
    expect(computeFunctionalSignificance({ functional_salience: 0.6 })).toBeCloseTo(0.6);
  });

  it('computes weighted average (multiple dimensions)', () => {
    const result = computeFunctionalSignificance({
      functional_salience: 0.6,
      functional_urgency: 0.4,
    });
    expect(result).toBeCloseTo(0.5);
  });

  it('excludes null dimensions', () => {
    const result = computeFunctionalSignificance({
      functional_salience: 0.6,
      functional_urgency: null,
    });
    expect(result).toBeCloseTo(0.6);
  });

  it('applies custom weights', () => {
    // salience weight=3, urgency weight=1 → (0.8*3 + 0.4*1) / (3+1) = 2.8/4 = 0.7
    const result = computeFunctionalSignificance(
      { functional_salience: 0.8, functional_urgency: 0.4 },
      { functional_salience: 3.0, functional_urgency: 1.0 },
    );
    expect(result).toBeCloseTo(0.7);
  });

  it('computes from all 10 dimensions when all provided', () => {
    const scores: Record<string, number> = {};
    for (const dim of FUNCTIONAL_DIMENSION_PROPERTIES) {
      scores[dim] = 0.3;
    }
    const result = computeFunctionalSignificance(scores);
    expect(result).toBeCloseTo(0.3);
  });
});

// ─── computeTotalSignificance ────────────────────────────────────────────

describe('computeTotalSignificance', () => {
  it('returns null when both sub-composites are null', () => {
    expect(computeTotalSignificance(null, null)).toBeNull();
  });

  it('uses only feel when functional is null', () => {
    expect(computeTotalSignificance(0.6, null)).toBeCloseTo(0.6);
  });

  it('uses only functional when feel is null', () => {
    expect(computeTotalSignificance(null, 0.4)).toBeCloseTo(0.4);
  });

  it('sums both sub-composites', () => {
    expect(computeTotalSignificance(0.6, 0.4)).toBeCloseTo(1.0);
  });

  it('handles zero values (not null)', () => {
    expect(computeTotalSignificance(0, 0.5)).toBeCloseTo(0.5);
    expect(computeTotalSignificance(0, 0)).toBeCloseTo(0);
  });
});

// ─── computeAllComposites ────────────────────────────────────────────────

describe('computeAllComposites', () => {
  it('returns all nulls when no dimensions provided', () => {
    const result = computeAllComposites({});
    expect(result.feel_significance).toBeNull();
    expect(result.functional_significance).toBeNull();
    expect(result.total_significance).toBeNull();
  });

  it('computes all three from mixed dimensions', () => {
    const result = computeAllComposites({
      feel_happiness: 0.8,
      feel_sadness: 0.2,
      functional_salience: 0.6,
    });
    expect(result.feel_significance).toBeCloseTo(0.5);
    expect(result.functional_significance).toBeCloseTo(0.6);
    expect(result.total_significance).toBeCloseTo(1.1);
  });

  it('handles only feel dimensions (no functional)', () => {
    const result = computeAllComposites({ feel_happiness: 0.8 });
    expect(result.feel_significance).toBeCloseTo(0.8);
    expect(result.functional_significance).toBeNull();
    expect(result.total_significance).toBeCloseTo(0.8);
  });

  it('handles only functional dimensions (no feel)', () => {
    const result = computeAllComposites({ functional_urgency: 0.4 });
    expect(result.feel_significance).toBeNull();
    expect(result.functional_significance).toBeCloseTo(0.4);
    expect(result.total_significance).toBeCloseTo(0.4);
  });

  it('applies custom weights to both layers', () => {
    const result = computeAllComposites(
      {
        feel_happiness: 0.8,
        feel_sadness: 0.2,
        functional_salience: 0.6,
        functional_urgency: 0.4,
      },
      {
        feel: { feel_happiness: 3.0, feel_sadness: 1.0 },
        functional: { functional_salience: 1.0, functional_urgency: 1.0 },
      },
    );
    // feel: (0.8*3 + 0.2*1) / (3+1) = 2.6/4 = 0.65
    expect(result.feel_significance).toBeCloseTo(0.65);
    // functional: (0.6 + 0.4) / 2 = 0.5
    expect(result.functional_significance).toBeCloseTo(0.5);
    // total = 0.65 + 0.5 = 1.15
    expect(result.total_significance).toBeCloseTo(1.15);
  });

  it('handles valence absolute value in composite computation', () => {
    const result = computeAllComposites({ feel_valence: -0.8 });
    // abs(-0.8) = 0.8
    expect(result.feel_significance).toBeCloseTo(0.8);
  });
});

// ─── DEFAULT_WEIGHTS ─────────────────────────────────────────────────────

describe('DEFAULT_WEIGHTS', () => {
  it('has entry for all 21 feel dimensions', () => {
    for (const dim of FEEL_DIMENSION_PROPERTIES) {
      expect(DEFAULT_WEIGHTS.feel[dim]).toBe(1.0);
    }
  });

  it('has entry for all 10 functional dimensions', () => {
    for (const dim of FUNCTIONAL_DIMENSION_PROPERTIES) {
      expect(DEFAULT_WEIGHTS.functional[dim]).toBe(1.0);
    }
  });
});
