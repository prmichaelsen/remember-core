jest.mock('weaviate-client', () => ({
  Filters: { and: (...args: any[]) => 'mock-combined-filter' },
}));

import {
  computeDecayIncrement,
  selectPruningCandidates,
  selectUrgencyDecayCandidates,
  runPruningPhase,
  DECAY_THRESHOLD,
  MAX_DECAY_INCREMENT,
  MIN_DECAY_INCREMENT,
  SIGNIFICANCE_FLOOR,
  SIGNIFICANCE_CEILING,
  URGENCY_DECAY_FACTOR,
  type PruningMemory,
} from './rem.pruning.js';
import { COHERENCE_TENSION_THRESHOLD, AGENCY_EXEMPTION_THRESHOLD } from './rem.constants.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeMemory(id: string, overrides: Record<string, any> = {}) {
  return {
    uuid: id,
    properties: {
      doc_type: 'memory',
      content_type: 'text',
      total_significance: 0.1,
      feel_coherence_tension: 0,
      functional_agency: 0,
      functional_urgency: 0,
      functional_salience: 0.5,
      decay: 0,
      rem_visits: 1,
      deleted_at: null,
      ...overrides,
    },
  };
}

function createMockCollection(objects: any[] = [], urgencyObjects?: any[]) {
  const fetchMock = jest.fn().mockResolvedValue({ objects });
  // If urgencyObjects provided, second call returns those
  if (urgencyObjects) {
    fetchMock
      .mockResolvedValueOnce({ objects })
      .mockResolvedValueOnce({ objects: urgencyObjects });
  }

  return {
    filter: {
      byProperty: (prop: string) => ({
        equal: (val: any) => `mock-filter-${prop}-eq-${val}`,
        lessThan: (val: any) => `mock-filter-${prop}-lt-${val}`,
        greaterThan: (val: any) => `mock-filter-${prop}-gt-${val}`,
        greaterOrEqual: (val: any) => `mock-filter-${prop}-gte-${val}`,
        isNull: (val: boolean) => `mock-filter-${prop}-isNull-${val}`,
      }),
    },
    sort: {
      byProperty: () => 'mock-sort',
    },
    query: {
      fetchObjects: fetchMock,
    },
    data: {
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function createMockLogger() {
  return { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

// ─── computeDecayIncrement ───────────────────────────────────────────────

describe('computeDecayIncrement', () => {
  it('returns MAX_DECAY_INCREMENT for very low significance', () => {
    const result = computeDecayIncrement({
      total_significance: 0.05,
      feel_coherence_tension: 0,
      functional_agency: 0,
    });
    expect(result).toBe(MAX_DECAY_INCREMENT);
  });

  it('returns 0 for significance at or above ceiling', () => {
    expect(computeDecayIncrement({
      total_significance: SIGNIFICANCE_CEILING,
      feel_coherence_tension: 0,
      functional_agency: 0,
    })).toBe(0);
    expect(computeDecayIncrement({
      total_significance: 0.8,
      feel_coherence_tension: 0,
      functional_agency: 0,
    })).toBe(0);
  });

  it('returns 0 for high coherence tension (exempt)', () => {
    expect(computeDecayIncrement({
      total_significance: 0.1,
      feel_coherence_tension: COHERENCE_TENSION_THRESHOLD,
      functional_agency: 0,
    })).toBe(0);
    expect(computeDecayIncrement({
      total_significance: 0.1,
      feel_coherence_tension: 0.9,
      functional_agency: 0,
    })).toBe(0);
  });

  it('returns 0 for high agency (exempt, OR logic)', () => {
    expect(computeDecayIncrement({
      total_significance: 0.1,
      feel_coherence_tension: 0,
      functional_agency: AGENCY_EXEMPTION_THRESHOLD,
    })).toBe(0);
    expect(computeDecayIncrement({
      total_significance: 0.1,
      feel_coherence_tension: 0,
      functional_agency: 0.9,
    })).toBe(0);
  });

  it('scales inversely with total_significance', () => {
    const low = computeDecayIncrement({
      total_significance: 0.1,
      feel_coherence_tension: 0,
      functional_agency: 0,
    });
    const mid = computeDecayIncrement({
      total_significance: 0.35,
      feel_coherence_tension: 0,
      functional_agency: 0,
    });
    expect(low).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThanOrEqual(MIN_DECAY_INCREMENT);
  });

  it('returns at least MIN_DECAY_INCREMENT for significance just below ceiling', () => {
    const result = computeDecayIncrement({
      total_significance: 0.49,
      feel_coherence_tension: 0,
      functional_agency: 0,
    });
    expect(result).toBeGreaterThanOrEqual(MIN_DECAY_INCREMENT);
    expect(result).toBeLessThanOrEqual(MAX_DECAY_INCREMENT);
  });

  it('coherence tension exemption takes priority over low significance', () => {
    expect(computeDecayIncrement({
      total_significance: 0,
      feel_coherence_tension: 0.8,
      functional_agency: 0,
    })).toBe(0);
  });

  it('agency exemption takes priority over low significance', () => {
    expect(computeDecayIncrement({
      total_significance: 0,
      feel_coherence_tension: 0,
      functional_agency: 0.8,
    })).toBe(0);
  });
});

// ─── selectPruningCandidates ─────────────────────────────────────────────

describe('selectPruningCandidates', () => {
  it('filters out content_type rem memories', async () => {
    const objects = [
      makeMemory('m1', { content_type: 'text' }),
      makeMemory('m2', { content_type: 'rem' }),
    ];
    const collection = createMockCollection(objects);

    const result = await selectPruningCandidates(collection, 50);
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('m1');
  });

  it('respects batch size', async () => {
    const collection = createMockCollection([]);
    await selectPruningCandidates(collection, 10);
    expect(collection.query.fetchObjects).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 }),
    );
  });

  it('returns empty array when no candidates', async () => {
    const collection = createMockCollection([]);
    const result = await selectPruningCandidates(collection, 50);
    expect(result).toEqual([]);
  });
});

// ─── selectUrgencyDecayCandidates ────────────────────────────────────────

describe('selectUrgencyDecayCandidates', () => {
  it('returns memories with functional_urgency > 0', async () => {
    const objects = [makeMemory('m1', { functional_urgency: 0.5 })];
    const collection = createMockCollection(objects);

    const result = await selectUrgencyDecayCandidates(collection, 100);
    expect(result).toHaveLength(1);
  });
});

// ─── runPruningPhase ─────────────────────────────────────────────────────

describe('runPruningPhase', () => {
  it('returns zero counts when no candidates', async () => {
    const collection = createMockCollection([], []);
    const result = await runPruningPhase(collection, {}, createMockLogger());

    expect(result.candidates_found).toBe(0);
    expect(result.memories_decayed).toBe(0);
    expect(result.memories_soft_deleted).toBe(0);
  });

  it('applies decay increment to low-significance memories', async () => {
    const memories = [makeMemory('m1', { total_significance: 0.1, decay: 0 })];
    const collection = createMockCollection(memories, []);
    const result = await runPruningPhase(collection, {}, createMockLogger());

    expect(result.memories_decayed).toBe(1);
    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.id).toBe('m1');
    expect(updateCall.properties.decay).toBe(MAX_DECAY_INCREMENT);
  });

  it('skips exempt memories (high coherence tension)', async () => {
    const memories = [makeMemory('m1', {
      total_significance: 0.1,
      feel_coherence_tension: 0.8,
    })];
    const collection = createMockCollection(memories, []);
    const result = await runPruningPhase(collection, {}, createMockLogger());

    expect(result.memories_skipped).toBe(1);
    expect(result.memories_decayed).toBe(0);
  });

  it('skips exempt memories (high agency)', async () => {
    const memories = [makeMemory('m1', {
      total_significance: 0.1,
      functional_agency: 0.8,
    })];
    const collection = createMockCollection(memories, []);
    const result = await runPruningPhase(collection, {}, createMockLogger());

    expect(result.memories_skipped).toBe(1);
    expect(result.memories_decayed).toBe(0);
  });

  it('soft-deletes memories crossing DECAY_THRESHOLD', async () => {
    const memories = [makeMemory('m1', {
      total_significance: 0.1,
      decay: 0.85,
    })];
    const collection = createMockCollection(memories, []);
    const result = await runPruningPhase(collection, {}, createMockLogger());

    expect(result.memories_soft_deleted).toBe(1);
    expect(result.memories_decayed).toBe(1);

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.deleted_at).toBeDefined();
    expect(updateCall.properties.decay).toBeGreaterThanOrEqual(DECAY_THRESHOLD);
  });

  it('simulates multi-cycle decay progression to soft-delete', () => {
    // Simulate 6+ cycles for a very low significance memory
    let decay = 0;
    let cycles = 0;
    const memory: PruningMemory = {
      total_significance: 0.1,
      feel_coherence_tension: 0,
      functional_agency: 0,
    };

    while (decay < DECAY_THRESHOLD && cycles < 20) {
      const increment = computeDecayIncrement(memory);
      decay = Math.min(1.0, decay + increment);
      cycles++;
    }

    expect(decay).toBeGreaterThanOrEqual(DECAY_THRESHOLD);
    expect(cycles).toBe(6); // ~6 cycles at MAX_DECAY_INCREMENT (0.15) to reach 0.9
  });

  it('updates rem_touched_at and rem_visits on decayed memories', async () => {
    const memories = [makeMemory('m1', {
      total_significance: 0.1,
      decay: 0,
      rem_visits: 3,
    })];
    const collection = createMockCollection(memories, []);
    await runPruningPhase(collection, {}, createMockLogger());

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.rem_touched_at).toBeDefined();
    expect(updateCall.properties.rem_visits).toBe(4);
  });

  it('decays functional_urgency by 10% per cycle', async () => {
    const urgencyMemories = [makeMemory('u1', { functional_urgency: 0.8 })];
    const collection = createMockCollection([], urgencyMemories);
    const result = await runPruningPhase(collection, {}, createMockLogger());

    expect(result.urgency_decayed).toBe(1);
    // Find the urgency update call (second update, after pruning candidates)
    const urgencyUpdate = collection.data.update.mock.calls.find(
      (call: any) => call[0].id === 'u1',
    );
    expect(urgencyUpdate).toBeDefined();
    expect(urgencyUpdate![0].properties.functional_urgency).toBeCloseTo(0.8 * URGENCY_DECAY_FACTOR);
  });

  it('does not decay functional_salience', async () => {
    const urgencyMemories = [makeMemory('u1', { functional_urgency: 0.5, functional_salience: 0.9 })];
    const collection = createMockCollection([], urgencyMemories);
    await runPruningPhase(collection, {}, createMockLogger());

    const urgencyUpdate = collection.data.update.mock.calls.find(
      (call: any) => call[0].id === 'u1',
    );
    // Should only update functional_urgency, not functional_salience
    expect(urgencyUpdate![0].properties.functional_salience).toBeUndefined();
  });

  it('does not prune content_type rem memories', async () => {
    const memories = [makeMemory('m1', { content_type: 'rem', total_significance: 0.05 })];
    const collection = createMockCollection(memories, []);
    const result = await runPruningPhase(collection, {}, createMockLogger());

    expect(result.candidates_found).toBe(0);
    expect(result.memories_decayed).toBe(0);
  });

  it('caps decay at 1.0', async () => {
    const memories = [makeMemory('m1', {
      total_significance: 0.1,
      decay: 0.95,
    })];
    const collection = createMockCollection(memories, []);
    await runPruningPhase(collection, {}, createMockLogger());

    const updateCall = collection.data.update.mock.calls[0][0];
    expect(updateCall.properties.decay).toBeLessThanOrEqual(1.0);
  });

  it('handles errors in individual memories gracefully', async () => {
    const memories = [
      makeMemory('m1', { total_significance: 0.1 }),
      makeMemory('m2', { total_significance: 0.1 }),
    ];
    const collection = createMockCollection(memories, []);
    collection.data.update
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(undefined);

    const logger = createMockLogger();
    const result = await runPruningPhase(collection, {}, logger);

    // m1 fails, m2 succeeds
    expect(result.memories_decayed).toBe(1);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('soft-delete recovery: clearing deleted_at and resetting decay', () => {
    // Conceptual test — verifying the recovery path is possible
    // A recovered memory would have deleted_at: null and decay: 0
    // After recovery, computeDecayIncrement should return a normal value
    const recovered: PruningMemory = {
      total_significance: 0.1,
      feel_coherence_tension: 0,
      functional_agency: 0,
    };
    const increment = computeDecayIncrement(recovered);
    expect(increment).toBeGreaterThan(0);
  });
});
