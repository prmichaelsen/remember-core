import {
  buildGradedSlices,
  buildEvenSlices,
  GRADED_OFFSETS_MS,
  BUCKET_COUNT,
} from './time-slices.js';

describe('buildGradedSlices', () => {
  const now = new Date('2026-03-03T12:00:00.000Z').getTime();

  it('returns 14 slices', () => {
    const slices = buildGradedSlices(now);
    expect(slices).toHaveLength(14);
  });

  it('first slice "to" equals ISO of now', () => {
    const slices = buildGradedSlices(now);
    expect(slices[0].to).toBe(new Date(now).toISOString());
  });

  it('last slice has no "from" (open lower bound)', () => {
    const slices = buildGradedSlices(now);
    expect(slices[13].from).toBeUndefined();
  });

  it('boundaries are monotonically decreasing', () => {
    const slices = buildGradedSlices(now);
    for (let i = 0; i < slices.length - 1; i++) {
      // Each slice's "to" should be > next slice's "to"
      expect(new Date(slices[i].to).getTime()).toBeGreaterThan(
        new Date(slices[i + 1].to).getTime()
      );
    }
  });

  it('adjacent slices share boundaries (to[i+1] === from[i])', () => {
    const slices = buildGradedSlices(now);
    for (let i = 0; i < slices.length - 2; i++) {
      // slice[i].from should equal slice[i+1].to (contiguous)
      expect(slices[i].from).toBe(slices[i + 1].to);
    }
  });

  it('labels are bucket-1 through bucket-14', () => {
    const slices = buildGradedSlices(now);
    slices.forEach((s, i) => {
      expect(s.label).toBe(`bucket-${i + 1}`);
    });
  });

  it('uses correct offset boundaries', () => {
    const slices = buildGradedSlices(now);
    // First bucket: to = now - 0, from = now - 10m
    expect(slices[0].to).toBe(new Date(now).toISOString());
    expect(slices[0].from).toBe(new Date(now - 10 * 60_000).toISOString());
    // Second bucket: to = now - 10m, from = now - 30m
    expect(slices[1].to).toBe(new Date(now - 10 * 60_000).toISOString());
    expect(slices[1].from).toBe(new Date(now - 30 * 60_000).toISOString());
  });
});

describe('buildEvenSlices', () => {
  const now = new Date('2026-03-03T12:00:00.000Z').getTime();

  it('returns BUCKET_COUNT slices', () => {
    const oldest = new Date('2025-03-03T12:00:00.000Z').toISOString(); // 1 year ago
    const slices = buildEvenSlices(oldest, now);
    expect(slices).toHaveLength(BUCKET_COUNT);
  });

  it('first slice "from" equals oldest date', () => {
    const oldest = '2025-06-01T00:00:00.000Z';
    const slices = buildEvenSlices(oldest, now);
    expect(slices[0].from).toBe(oldest);
  });

  it('last slice "to" is close to now', () => {
    const oldest = '2025-06-01T00:00:00.000Z';
    const slices = buildEvenSlices(oldest, now);
    const lastTo = new Date(slices[BUCKET_COUNT - 1].to).getTime();
    // Should be very close to now (within 1ms due to floating point)
    expect(Math.abs(lastTo - now)).toBeLessThanOrEqual(1);
  });

  it('all buckets have equal width', () => {
    const oldest = '2025-03-03T12:00:00.000Z';
    const slices = buildEvenSlices(oldest, now);
    const widths = slices.map(s => {
      return new Date(s.to).getTime() - new Date(s.from!).getTime();
    });
    const expectedWidth = (now - new Date(oldest).getTime()) / BUCKET_COUNT;
    widths.forEach(w => {
      // Allow 1ms tolerance for floating point
      expect(Math.abs(w - expectedWidth)).toBeLessThanOrEqual(1);
    });
  });

  it('adjacent slices are contiguous', () => {
    const oldest = '2025-03-03T12:00:00.000Z';
    const slices = buildEvenSlices(oldest, now);
    for (let i = 0; i < slices.length - 1; i++) {
      expect(slices[i].to).toBe(slices[i + 1].from);
    }
  });

  it('handles zero span (oldest = now) without error', () => {
    const oldest = new Date(now).toISOString();
    const slices = buildEvenSlices(oldest, now);
    expect(slices).toHaveLength(BUCKET_COUNT);
    // All slices have zero width — from and to should be identical
    slices.forEach(s => {
      expect(s.from).toBe(s.to);
    });
  });

  it('handles very short span (1 second)', () => {
    const oldest = new Date(now - 1000).toISOString();
    const slices = buildEvenSlices(oldest, now);
    expect(slices).toHaveLength(BUCKET_COUNT);
    // Width should be ~71ms per bucket
    const expectedWidth = 1000 / BUCKET_COUNT;
    slices.forEach(s => {
      const width = new Date(s.to).getTime() - new Date(s.from!).getTime();
      expect(Math.abs(width - expectedWidth)).toBeLessThanOrEqual(1);
    });
  });

  it('labels are bucket-1 through bucket-14', () => {
    const oldest = '2025-03-03T12:00:00.000Z';
    const slices = buildEvenSlices(oldest, now);
    slices.forEach((s, i) => {
      expect(s.label).toBe(`bucket-${i + 1}`);
    });
  });
});
