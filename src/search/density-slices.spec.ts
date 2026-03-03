import {
  buildGradedDensitySlices,
  buildEvenDensitySlices,
  GRADED_DENSITY_BOUNDARIES,
  DENSITY_BUCKET_COUNT,
} from './density-slices.js';

describe('buildGradedDensitySlices', () => {
  it('returns 9 slices', () => {
    const slices = buildGradedDensitySlices();
    expect(slices).toHaveLength(DENSITY_BUCKET_COUNT);
  });

  it('first slice is the highest density (50+, no upper bound)', () => {
    const slices = buildGradedDensitySlices();
    expect(slices[0].min).toBe(50);
    expect(slices[0].max).toBeUndefined();
  });

  it('last slice is the lowest density (0-0)', () => {
    const slices = buildGradedDensitySlices();
    expect(slices[8].min).toBe(0);
    expect(slices[8].max).toBe(0);
  });

  it('boundaries cover all integers from 0 to infinity', () => {
    const slices = buildGradedDensitySlices();
    // Check that every integer 0-49 is covered exactly once
    const covered = new Set();
    for (const slice of slices) {
      if (slice.max === undefined) continue; // open-ended top bucket
      for (let i = slice.min; i <= slice.max; i++) {
        expect(covered.has(i)).toBe(false);
        covered.add(i);
      }
    }
    for (let i = 0; i < 50; i++) {
      expect(covered.has(i)).toBe(true);
    }
  });

  it('adjacent slices are contiguous (no gaps)', () => {
    const slices = buildGradedDensitySlices();
    // Slices are desc, so slice[i+1].max + 1 === slice[i].min (for bounded slices)
    for (let i = 0; i < slices.length - 1; i++) {
      const currentMin = slices[i].min;
      const nextMax = slices[i + 1].max;
      if (nextMax !== undefined) {
        expect(nextMax + 1).toBe(currentMin);
      }
    }
  });

  it('labels are density-1 through density-9', () => {
    const slices = buildGradedDensitySlices();
    slices.forEach((s, i) => {
      expect(s.label).toBe(`density-${i + 1}`);
    });
  });

  it('matches GRADED_DENSITY_BOUNDARIES', () => {
    const slices = buildGradedDensitySlices();
    slices.forEach((s, i) => {
      expect(s.min).toBe(GRADED_DENSITY_BOUNDARIES[i].min);
      expect(s.max).toBe(GRADED_DENSITY_BOUNDARIES[i].max);
    });
  });
});

describe('buildEvenDensitySlices', () => {
  it('returns single [0,0] slice when maxCount is 0', () => {
    const slices = buildEvenDensitySlices(0);
    expect(slices).toHaveLength(1);
    expect(slices[0]).toEqual({ label: 'density-1', min: 0, max: 0 });
  });

  it('returns maxCount+1 buckets when maxCount < bucketCount', () => {
    // maxCount=3 → values 0,1,2,3 → 4 buckets (each width 1)
    const slices = buildEvenDensitySlices(3);
    expect(slices).toHaveLength(4);
    expect(slices[0]).toEqual({ label: 'density-1', min: 0, max: 0 });
    expect(slices[1]).toEqual({ label: 'density-2', min: 1, max: 1 });
    expect(slices[2]).toEqual({ label: 'density-3', min: 2, max: 2 });
    expect(slices[3]).toEqual({ label: 'density-4', min: 3, max: 3 });
  });

  it('distributes evenly for large maxCount', () => {
    const slices = buildEvenDensitySlices(89); // 90 values → 10 per bucket
    expect(slices).toHaveLength(DENSITY_BUCKET_COUNT);
    // All integers 0-89 should be covered exactly once
    const covered = new Set();
    for (const slice of slices) {
      for (let i = slice.min; i <= slice.max!; i++) {
        expect(covered.has(i)).toBe(false);
        covered.add(i);
      }
    }
    for (let i = 0; i <= 89; i++) {
      expect(covered.has(i)).toBe(true);
    }
  });

  it('no gaps between adjacent slices', () => {
    const slices = buildEvenDensitySlices(50);
    for (let i = 0; i < slices.length - 1; i++) {
      expect(slices[i].max! + 1).toBe(slices[i + 1].min);
    }
  });

  it('last slice max equals maxCount', () => {
    const slices = buildEvenDensitySlices(42);
    expect(slices[slices.length - 1].max).toBe(42);
  });

  it('first slice starts at 0', () => {
    const slices = buildEvenDensitySlices(100);
    expect(slices[0].min).toBe(0);
  });

  it('labels are sequential density-N', () => {
    const slices = buildEvenDensitySlices(50);
    slices.forEach((s, i) => {
      expect(s.label).toBe(`density-${i + 1}`);
    });
  });

  it('respects custom bucketCount', () => {
    const slices = buildEvenDensitySlices(99, 5);
    expect(slices).toHaveLength(5);
    // Should cover 0-99
    expect(slices[0].min).toBe(0);
    expect(slices[4].max).toBe(99);
  });
});
