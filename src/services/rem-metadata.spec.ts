import { buildRemMetadataUpdate } from './rem-metadata.js';

describe('buildRemMetadataUpdate', () => {
  it('sets rem_touched_at to ISO timestamp', () => {
    const now = new Date('2026-03-07T12:00:00.000Z');
    const update = buildRemMetadataUpdate(0, now);
    expect(update.rem_touched_at).toBe('2026-03-07T12:00:00.000Z');
  });

  it('increments rem_visits from 0 to 1 on first scoring', () => {
    const update = buildRemMetadataUpdate(0);
    expect(update.rem_visits).toBe(1);
  });

  it('increments rem_visits from N to N+1 on subsequent scorings', () => {
    expect(buildRemMetadataUpdate(3).rem_visits).toBe(4);
    expect(buildRemMetadataUpdate(10).rem_visits).toBe(11);
  });

  it('uses current time when no timestamp provided', () => {
    const before = Date.now();
    const update = buildRemMetadataUpdate(0);
    const after = Date.now();

    const ts = new Date(update.rem_touched_at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('produces valid ISO string format', () => {
    const update = buildRemMetadataUpdate(0);
    // ISO 8601 format check
    expect(update.rem_touched_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
