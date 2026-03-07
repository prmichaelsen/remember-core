import {
  runPhase0,
  selectMemoriesForScoring,
  DEFAULT_PHASE0_CONFIG,
  type Phase0Deps,
} from './rem-phase0.scoring.js';
import { createMockCollection, createMockLogger } from '../testing/weaviate-mock.js';
import { ALL_SCORING_DIMENSIONS } from '../database/weaviate/v2-collections.js';
import type { EmotionalScoringService } from './emotional-scoring.service.js';
import type { ScoringContextService } from './scoring-context.service.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function createMockEmotionalScoringService(defaultScore = 0.5): EmotionalScoringService {
  const scores: Record<string, number | null> = {};
  for (const dim of ALL_SCORING_DIMENSIONS) {
    scores[dim] = defaultScore;
  }

  return {
    scoreAllDimensions: jest.fn().mockResolvedValue(scores),
    scoreDimension: jest.fn().mockResolvedValue({ property: 'test', score: defaultScore }),
    getDimension: jest.fn(),
  } as any;
}

function createMockScoringContextService(): ScoringContextService {
  return {
    gatherScoringContext: jest.fn().mockResolvedValue({
      relationship_observations: [],
      nearest_neighbor_scores: {},
      collection_averages: {},
    }),
    fetchRelationshipObservations: jest.fn().mockResolvedValue([]),
    fetchNearestNeighborScores: jest.fn().mockResolvedValue([]),
    computeCollectionAverages: jest.fn().mockResolvedValue({}),
  } as any;
}

async function seedMemories(
  collection: ReturnType<typeof createMockCollection>,
  memories: Array<{ id: string; content: string; rem_touched_at?: string; rem_visits?: number }>,
) {
  for (const mem of memories) {
    await collection.data.insert({
      id: mem.id,
      properties: {
        doc_type: 'memory',
        content: mem.content,
        content_type: 'text',
        created_at: '2026-03-07T12:00:00Z',
        rem_touched_at: mem.rem_touched_at ?? null,
        rem_visits: mem.rem_visits ?? 0,
      },
    });
  }
}

describe('REM Phase 0 Scoring', () => {
  let collection: ReturnType<typeof createMockCollection>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    collection = createMockCollection();
    logger = createMockLogger();
  });

  // ── selectMemoriesForScoring ──────────────────────────────────────

  describe('selectMemoriesForScoring', () => {
    it('selects unscored memories first (rem_touched_at is null)', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'Unscored 1' },
        { id: 'm2', content: 'Unscored 2' },
        { id: 'm3', content: 'Scored', rem_touched_at: '2026-03-01T00:00:00Z', rem_visits: 1 },
      ]);

      const selected = await selectMemoriesForScoring(collection, 2);
      expect(selected).toHaveLength(2);
      // Should get unscored ones first
      const ids = selected.map((m) => m.uuid);
      expect(ids).toContain('m1');
      expect(ids).toContain('m2');
    });

    it('fills remaining batch with outdated scored memories', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'Unscored' },
        { id: 'm2', content: 'Old', rem_touched_at: '2026-01-01T00:00:00Z', rem_visits: 1 },
        { id: 'm3', content: 'Recent', rem_touched_at: '2026-03-01T00:00:00Z', rem_visits: 2 },
      ]);

      const selected = await selectMemoriesForScoring(collection, 3);
      expect(selected).toHaveLength(3);
    });

    it('respects batch size limit', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'A' },
        { id: 'm2', content: 'B' },
        { id: 'm3', content: 'C' },
        { id: 'm4', content: 'D' },
      ]);

      const selected = await selectMemoriesForScoring(collection, 2);
      expect(selected).toHaveLength(2);
    });

    it('returns empty array when no memories exist', async () => {
      const selected = await selectMemoriesForScoring(collection, 10);
      expect(selected).toEqual([]);
    });
  });

  // ── runPhase0 ─────────────────────────────────────────────────────

  describe('runPhase0', () => {
    it('scores all 31 dimensions per memory', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'Test memory' },
      ]);

      const emotionalScoring = createMockEmotionalScoringService();
      const deps: Phase0Deps = {
        emotionalScoringService: emotionalScoring,
        scoringContextService: createMockScoringContextService(),
        logger,
      };

      const result = await runPhase0(collection, 'test-col', deps);

      expect(result.memories_scored).toBe(1);
      expect(result.dimensions_scored).toBe(31);
      expect(emotionalScoring.scoreAllDimensions).toHaveBeenCalledTimes(1);
    });

    it('computes composite scores after dimension scoring', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'Test' },
      ]);

      const deps: Phase0Deps = {
        emotionalScoringService: createMockEmotionalScoringService(0.5),
        scoringContextService: createMockScoringContextService(),
        logger,
      };

      await runPhase0(collection, 'test-col', deps);

      const updated = await collection.query.fetchObjectById('m1');
      expect(updated!.properties.feel_significance).toBeDefined();
      expect(updated!.properties.functional_significance).toBeDefined();
      expect(updated!.properties.total_significance).toBeDefined();
    });

    it('sets rem_touched_at and increments rem_visits', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'Test', rem_visits: 0 },
      ]);

      const deps: Phase0Deps = {
        emotionalScoringService: createMockEmotionalScoringService(),
        scoringContextService: createMockScoringContextService(),
        logger,
      };

      const before = new Date().toISOString();
      await runPhase0(collection, 'test-col', deps);
      const after = new Date().toISOString();

      const updated = await collection.query.fetchObjectById('m1');
      expect(updated!.properties.rem_touched_at).toBeDefined();
      expect(updated!.properties.rem_touched_at >= before).toBe(true);
      expect(updated!.properties.rem_touched_at <= after).toBe(true);
      expect(updated!.properties.rem_visits).toBe(1);
    });

    it('increments rem_visits from N to N+1', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'Test', rem_touched_at: '2026-01-01T00:00:00Z', rem_visits: 3 },
      ]);

      const deps: Phase0Deps = {
        emotionalScoringService: createMockEmotionalScoringService(),
        scoringContextService: createMockScoringContextService(),
        logger,
      };

      await runPhase0(collection, 'test-col', deps);

      const updated = await collection.query.fetchObjectById('m1');
      expect(updated!.properties.rem_visits).toBe(4);
    });

    it('persists all scores to Weaviate in single update', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'Test' },
      ]);

      const deps: Phase0Deps = {
        emotionalScoringService: createMockEmotionalScoringService(0.7),
        scoringContextService: createMockScoringContextService(),
        logger,
      };

      await runPhase0(collection, 'test-col', deps);

      const updated = await collection.query.fetchObjectById('m1');
      // Check a few dimension scores
      expect(updated!.properties.feel_happiness).toBe(0.7);
      expect(updated!.properties.functional_salience).toBe(0.7);
      // Check metadata
      expect(updated!.properties.rem_touched_at).toBeTruthy();
      expect(updated!.properties.rem_visits).toBe(1);
    });

    it('stops processing when cost cap is reached', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'A' },
        { id: 'm2', content: 'B' },
        { id: 'm3', content: 'C' },
      ]);

      const deps: Phase0Deps = {
        emotionalScoringService: createMockEmotionalScoringService(),
        scoringContextService: createMockScoringContextService(),
        config: {
          batch_size: 10,
          cost_cap: 0.002,
          cost_per_memory: 0.0015,
        },
        logger,
      };

      const result = await runPhase0(collection, 'test-col', deps);

      expect(result.memories_scored).toBe(1);
      expect(result.stopped_by_cap).toBe(true);
    });

    it('respects batch size limit', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'A' },
        { id: 'm2', content: 'B' },
        { id: 'm3', content: 'C' },
      ]);

      const deps: Phase0Deps = {
        emotionalScoringService: createMockEmotionalScoringService(),
        scoringContextService: createMockScoringContextService(),
        config: { batch_size: 2, cost_cap: 100, cost_per_memory: 0.001 },
        logger,
      };

      const result = await runPhase0(collection, 'test-col', deps);
      expect(result.memories_scored).toBe(2);
    });

    it('handles empty collection gracefully', async () => {
      const deps: Phase0Deps = {
        emotionalScoringService: createMockEmotionalScoringService(),
        scoringContextService: createMockScoringContextService(),
        logger,
      };

      const result = await runPhase0(collection, 'test-col', deps);
      expect(result.memories_scored).toBe(0);
      expect(result.memories_skipped).toBe(0);
    });

    it('handles partial failures gracefully (skips failed, continues)', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'Good' },
        { id: 'm2', content: 'Bad' },
        { id: 'm3', content: 'Good again' },
      ]);

      let callCount = 0;
      const emotionalScoring = createMockEmotionalScoringService();
      (emotionalScoring.scoreAllDimensions as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 2) throw new Error('scoring failed');
        const scores: Record<string, number | null> = {};
        for (const dim of ALL_SCORING_DIMENSIONS) scores[dim] = 0.5;
        return scores;
      });

      const deps: Phase0Deps = {
        emotionalScoringService: emotionalScoring,
        scoringContextService: createMockScoringContextService(),
        config: { batch_size: 10, cost_cap: 100, cost_per_memory: 0.001 },
        logger,
      };

      const result = await runPhase0(collection, 'test-col', deps);
      expect(result.memories_scored).toBe(2);
      expect(result.memories_skipped).toBe(1);
    });

    it('gathers scoring context for each memory', async () => {
      await seedMemories(collection, [
        { id: 'm1', content: 'Test 1' },
        { id: 'm2', content: 'Test 2' },
      ]);

      const contextService = createMockScoringContextService();
      const deps: Phase0Deps = {
        emotionalScoringService: createMockEmotionalScoringService(),
        scoringContextService: contextService,
        logger,
      };

      await runPhase0(collection, 'test-col', deps);

      expect(contextService.gatherScoringContext).toHaveBeenCalledTimes(2);
    });
  });
});
