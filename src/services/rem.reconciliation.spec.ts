jest.mock('weaviate-client', () => ({
  Filters: { and: (...args: any[]) => 'mock-combined-filter' },
}));

import {
  selectReconciliationCandidates,
  detectConflicts,
  buildReconciliationPrompt,
  generateObservation,
  runReconciliationPhase,
  CONFLICT_SIMILARITY_THRESHOLD,
  type ConflictPair,
  type ReconciliationDeps,
} from './rem.reconciliation.js';
import { COHERENCE_TENSION_THRESHOLD } from './rem.constants.js';
import { computeDecayIncrement } from './rem.pruning.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeMemory(id: string, overrides: Record<string, any> = {}) {
  return {
    uuid: id,
    properties: {
      doc_type: 'memory',
      content: `Memory ${id} content`,
      content_type: 'text',
      feel_coherence_tension: 0.8,
      feel_valence: 0.5,
      deleted_at: null,
      rem_touched_at: null,
      rem_visits: 1,
      observation: '',
      ...overrides,
    },
  };
}

function createMockCollection(
  candidates: any[] = [],
  nearObjectResults: any[] = [],
  fetchByIdResult?: any,
) {
  return {
    filter: {
      byProperty: (prop: string) => ({
        equal: (val: any) => `mock-filter-${prop}-eq-${val}`,
        greaterOrEqual: (val: any) => `mock-filter-${prop}-gte-${val}`,
        isNull: (val: boolean) => `mock-filter-${prop}-isNull-${val}`,
      }),
    },
    sort: {
      byProperty: () => 'mock-sort',
    },
    query: {
      fetchObjects: jest.fn().mockResolvedValue({ objects: candidates }),
      nearObject: jest.fn().mockResolvedValue({ objects: nearObjectResults }),
      fetchObjectById: jest.fn().mockResolvedValue(fetchByIdResult ?? null),
    },
    data: {
      insert: jest.fn().mockResolvedValue({ uuid: 'rem-obs-1' }),
      update: jest.fn().mockResolvedValue(undefined),
    },
  };
}

function createMockDeps(overrides?: Partial<ReconciliationDeps>): ReconciliationDeps {
  return {
    subLlm: {
      score: jest.fn().mockResolvedValue(
        'These memories express conflicting feelings about your daily routine.',
      ),
    },
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    ...overrides,
  };
}

// ─── selectReconciliationCandidates ──────────────────────────────────────

describe('selectReconciliationCandidates', () => {
  it('returns memories with high coherence tension', async () => {
    const objects = [
      makeMemory('m1', { feel_coherence_tension: 0.85 }),
      makeMemory('m2', { feel_coherence_tension: 0.75 }),
    ];
    const collection = createMockCollection(objects);

    const result = await selectReconciliationCandidates(collection, 20);
    expect(result).toHaveLength(2);
  });

  it('filters out memories already processed in current cycle', async () => {
    const objects = [
      makeMemory('m1', { feel_coherence_tension: 0.85, rem_touched_at: '2026-03-07T10:00:00Z' }),
      makeMemory('m2', { feel_coherence_tension: 0.75, rem_touched_at: '2026-03-06T10:00:00Z' }),
    ];
    const collection = createMockCollection(objects);

    const result = await selectReconciliationCandidates(
      collection, 20, '2026-03-07T00:00:00Z',
    );
    // m1 was touched after cycle start, m2 before
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('m2');
  });

  it('returns all candidates when no currentCycleTimestamp', async () => {
    const objects = [makeMemory('m1', { rem_touched_at: '2026-03-07T10:00:00Z' })];
    const collection = createMockCollection(objects);

    const result = await selectReconciliationCandidates(collection, 20);
    expect(result).toHaveLength(1);
  });

  it('returns empty when no candidates', async () => {
    const collection = createMockCollection([]);
    const result = await selectReconciliationCandidates(collection, 20);
    expect(result).toEqual([]);
  });

  it('respects batch size', async () => {
    const collection = createMockCollection([]);
    await selectReconciliationCandidates(collection, 5);
    expect(collection.query.fetchObjects).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
    );
  });
});

// ─── detectConflicts ─────────────────────────────────────────────────────

describe('detectConflicts', () => {
  it('detects valence opposition between similar memories', async () => {
    const memory = makeMemory('m1', { feel_valence: 0.7, content: 'I love my job' });
    const similarMemories = [
      {
        uuid: 'm2',
        properties: { feel_valence: -0.5, content: 'I dread work', content_type: 'text' },
        metadata: { distance: 0.1 }, // similarity = 0.9
      },
    ];
    const collection = createMockCollection([], similarMemories);

    const conflicts = await detectConflicts(collection, memory);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflict_type).toBe('valence_opposition');
    expect(conflicts[0].memory_a_id).toBe('m1');
    expect(conflicts[0].memory_b_id).toBe('m2');
  });

  it('detects identity conflict with rem abstraction', async () => {
    const memory = makeMemory('m1', { feel_valence: 0.3, content: 'Had steak for dinner' });
    const similarMemories = [
      {
        uuid: 'rem1',
        properties: { feel_valence: 0.4, content: 'User is vegetarian', content_type: 'rem' },
        metadata: { distance: 0.15 },
      },
    ];
    const collection = createMockCollection([], similarMemories);

    const conflicts = await detectConflicts(collection, memory);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflict_type).toBe('identity_conflict');
  });

  it('skips memories below similarity threshold', async () => {
    const memory = makeMemory('m1', { feel_valence: 0.8 });
    const similarMemories = [
      {
        uuid: 'm2',
        properties: { feel_valence: -0.5, content_type: 'text' },
        metadata: { distance: 0.5 }, // similarity = 0.5, below threshold
      },
    ];
    const collection = createMockCollection([], similarMemories);

    const conflicts = await detectConflicts(collection, memory);
    expect(conflicts).toHaveLength(0);
  });

  it('skips self-reference', async () => {
    const memory = makeMemory('m1', { feel_valence: 0.8 });
    const similarMemories = [
      {
        uuid: 'm1', // same memory
        properties: { feel_valence: -0.5, content_type: 'text' },
        metadata: { distance: 0 },
      },
    ];
    const collection = createMockCollection([], similarMemories);

    const conflicts = await detectConflicts(collection, memory);
    expect(conflicts).toHaveLength(0);
  });

  it('returns empty array on error', async () => {
    const memory = makeMemory('m1');
    const collection = createMockCollection([]);
    collection.query.nearObject.mockRejectedValue(new Error('DB error'));

    const conflicts = await detectConflicts(collection, memory);
    expect(conflicts).toEqual([]);
  });

  it('truncates memory summaries to 200 chars', async () => {
    const longContent = 'A'.repeat(300);
    const memory = makeMemory('m1', { feel_valence: 0.7, content: longContent });
    const similarMemories = [
      {
        uuid: 'm2',
        properties: { feel_valence: -0.5, content: longContent, content_type: 'text' },
        metadata: { distance: 0.1 },
      },
    ];
    const collection = createMockCollection([], similarMemories);

    const conflicts = await detectConflicts(collection, memory);
    expect(conflicts[0].memory_a_summary.length).toBeLessThanOrEqual(200);
    expect(conflicts[0].memory_b_summary.length).toBeLessThanOrEqual(200);
  });
});

// ─── buildReconciliationPrompt ───────────────────────────────────────────

describe('buildReconciliationPrompt', () => {
  it('includes both memory summaries and conflict type', () => {
    const conflict: ConflictPair = {
      memory_a_id: 'm1',
      memory_b_id: 'm2',
      tension_score: 0.85,
      conflict_type: 'valence_opposition',
      memory_a_summary: 'I love my job',
      memory_b_summary: 'I dread going to work',
    };

    const prompt = buildReconciliationPrompt(conflict);
    expect(prompt).toContain('I love my job');
    expect(prompt).toContain('I dread going to work');
    expect(prompt).toContain('valence_opposition');
    expect(prompt).toContain('0.85');
  });
});

// ─── generateObservation ─────────────────────────────────────────────────

describe('generateObservation', () => {
  it('calls sub-LLM with reconciliation prompt and returns trimmed response', async () => {
    const subLlm = { score: jest.fn().mockResolvedValue('  Observation text  ') };
    const conflict: ConflictPair = {
      memory_a_id: 'm1',
      memory_b_id: 'm2',
      tension_score: 0.8,
      conflict_type: 'valence_opposition',
      memory_a_summary: 'Memory A',
      memory_b_summary: 'Memory B',
    };

    const result = await generateObservation(subLlm, conflict);
    expect(result).toBe('Observation text');
    expect(subLlm.score).toHaveBeenCalledTimes(1);
  });
});

// ─── runReconciliationPhase ──────────────────────────────────────────────

describe('runReconciliationPhase', () => {
  it('returns zero counts when no candidates', async () => {
    const collection = createMockCollection([]);
    const deps = createMockDeps();

    const result = await runReconciliationPhase(collection, deps);
    expect(result.candidates_found).toBe(0);
    expect(result.conflicts_detected).toBe(0);
    expect(result.reconciliation_observations_created).toBe(0);
  });

  it('creates REM observation memory with correct properties', async () => {
    const candidate = makeMemory('m1', {
      feel_coherence_tension: 0.85,
      feel_valence: 0.7,
      content: 'I love my job',
    });
    const conflicting = {
      uuid: 'm2',
      properties: { feel_valence: -0.5, content: 'I dread work', content_type: 'text' },
      metadata: { distance: 0.1 },
    };
    const fetchById = makeMemory('m1', { observation: 'Existing observation' });
    const collection = createMockCollection([candidate], [conflicting], fetchById);
    const deps = createMockDeps();

    const result = await runReconciliationPhase(collection, deps);

    expect(result.conflicts_detected).toBe(1);
    expect(result.reconciliation_observations_created).toBe(1);

    // Verify REM memory was inserted
    const insertCall = collection.data.insert.mock.calls[0][0];
    expect(insertCall.content_type).toBe('rem');
    expect(insertCall.doc_type).toBe('memory');
    expect(insertCall.trust_score).toBe(5);
    expect(insertCall.tags).toContain('rem-reconciliation');
    expect(insertCall.tags).toContain('valence_opposition');
    expect(insertCall.source).toBe('rem');
    expect(insertCall.related_memory_ids).toEqual(['m1', 'm2']);
  });

  it('updates source memory observations with reconciliation note', async () => {
    const candidate = makeMemory('m1', {
      feel_coherence_tension: 0.85,
      feel_valence: 0.7,
    });
    const conflicting = {
      uuid: 'm2',
      properties: { feel_valence: -0.5, content: 'Conflicting', content_type: 'text' },
      metadata: { distance: 0.1 },
    };
    const fetchById = makeMemory('m1', { observation: 'Old note', rem_visits: 2 });
    const collection = createMockCollection([candidate], [conflicting], fetchById);
    const deps = createMockDeps();

    await runReconciliationPhase(collection, deps);

    // Should have called update for both source memories
    const updateCalls = collection.data.update.mock.calls;
    expect(updateCalls.length).toBe(2);

    const firstUpdate = updateCalls[0][0];
    expect(firstUpdate.properties.observation).toContain('[REM Reconciliation]');
    expect(firstUpdate.properties.rem_touched_at).toBeDefined();
    expect(firstUpdate.properties.rem_visits).toBe(3);
  });

  it('deduplicates conflict pairs', async () => {
    // Two candidates that both detect each other as conflicts
    const m1 = makeMemory('m1', { feel_coherence_tension: 0.85, feel_valence: 0.7 });
    const m2 = makeMemory('m2', { feel_coherence_tension: 0.8, feel_valence: -0.5 });

    const m2AsNearResult = {
      uuid: 'm2',
      properties: { feel_valence: -0.5, content: 'Conflict', content_type: 'text' },
      metadata: { distance: 0.1 },
    };
    const m1AsNearResult = {
      uuid: 'm1',
      properties: { feel_valence: 0.7, content: 'Conflict', content_type: 'text' },
      metadata: { distance: 0.1 },
    };

    const collection = createMockCollection([m1, m2]);
    // First nearObject call (for m1) returns m2, second (for m2) returns m1
    collection.query.nearObject
      .mockResolvedValueOnce({ objects: [m2AsNearResult] })
      .mockResolvedValueOnce({ objects: [m1AsNearResult] });
    collection.query.fetchObjectById.mockResolvedValue(
      makeMemory('any', { observation: '', rem_visits: 1 }),
    );

    const deps = createMockDeps();
    const result = await runReconciliationPhase(collection, deps);

    // Should only create ONE observation despite two candidates detecting the same pair
    expect(result.conflicts_detected).toBe(1);
    expect(result.reconciliation_observations_created).toBe(1);
  });

  it('handles LLM failure gracefully', async () => {
    const candidate = makeMemory('m1', {
      feel_coherence_tension: 0.85,
      feel_valence: 0.7,
    });
    const conflicting = {
      uuid: 'm2',
      properties: { feel_valence: -0.5, content: 'Conflict', content_type: 'text' },
      metadata: { distance: 0.1 },
    };
    const collection = createMockCollection([candidate], [conflicting]);
    const deps = createMockDeps({
      subLlm: { score: jest.fn().mockRejectedValue(new Error('LLM timeout')) },
    });

    const result = await runReconciliationPhase(collection, deps);
    expect(result.conflicts_detected).toBe(1);
    expect(result.reconciliation_observations_created).toBe(0);
    expect(result.memories_skipped).toBe(1);
  });

  it('skips when observation is empty', async () => {
    const candidate = makeMemory('m1', {
      feel_coherence_tension: 0.85,
      feel_valence: 0.7,
    });
    const conflicting = {
      uuid: 'm2',
      properties: { feel_valence: -0.5, content: 'Conflict', content_type: 'text' },
      metadata: { distance: 0.1 },
    };
    const collection = createMockCollection([candidate], [conflicting]);
    const deps = createMockDeps({
      subLlm: { score: jest.fn().mockResolvedValue('   ') },
    });

    const result = await runReconciliationPhase(collection, deps);
    expect(result.reconciliation_observations_created).toBe(0);
    expect(result.memories_skipped).toBe(1);
  });
});

// ─── Cross-task: Pruning Resistance ──────────────────────────────────────

describe('pruning resistance (cross-task with Task 158)', () => {
  it('high coherence_tension memories return 0 from computeDecayIncrement', () => {
    const result = computeDecayIncrement({
      total_significance: 0.1, // would normally get max decay
      feel_coherence_tension: COHERENCE_TENSION_THRESHOLD,
      functional_agency: 0,
    });
    expect(result).toBe(0);
  });

  it('pruning resumes when coherence_tension drops below threshold', () => {
    const result = computeDecayIncrement({
      total_significance: 0.1,
      feel_coherence_tension: COHERENCE_TENSION_THRESHOLD - 0.1, // below threshold
      functional_agency: 0,
    });
    expect(result).toBeGreaterThan(0);
  });

  it('shared COHERENCE_TENSION_THRESHOLD is used by both modules', () => {
    // Verify the threshold is the same value used by both
    expect(COHERENCE_TENSION_THRESHOLD).toBe(0.7);
  });
});
