import {
  ScoringContextService,
  createCollectionStatsCache,
  type CollectionStatsCache,
} from './scoring-context.service.js';
import { createMockCollection, createMockLogger } from '../testing/weaviate-mock.js';

describe('ScoringContextService', () => {
  let collection: ReturnType<typeof createMockCollection>;
  let service: ScoringContextService;
  let statsCache: CollectionStatsCache;

  beforeEach(() => {
    collection = createMockCollection();
    service = new ScoringContextService({ logger: createMockLogger() });
    statsCache = createCollectionStatsCache();
  });

  // ── Relationship Observations ───────────────────────────────────────

  describe('fetchRelationshipObservations', () => {
    it('returns observations from connected relationship docs', async () => {
      await collection.data.insert({
        id: 'rel-1',
        properties: {
          doc_type: 'relationship',
          related_memory_ids: ['m1', 'm2'],
          observation: 'Both about music production',
        },
      });

      const result = await service.fetchRelationshipObservations(collection, 'm1');
      expect(result).toEqual(['Both about music production']);
    });

    it('returns empty array when no relationships exist', async () => {
      const result = await service.fetchRelationshipObservations(collection, 'no-rels');
      expect(result).toEqual([]);
    });

    it('skips relationships with empty or missing observation', async () => {
      await collection.data.insert({
        id: 'rel-1',
        properties: {
          doc_type: 'relationship',
          related_memory_ids: ['m1'],
          observation: 'Valid observation',
        },
      });
      await collection.data.insert({
        id: 'rel-2',
        properties: {
          doc_type: 'relationship',
          related_memory_ids: ['m1'],
          observation: '',
        },
      });
      await collection.data.insert({
        id: 'rel-3',
        properties: {
          doc_type: 'relationship',
          related_memory_ids: ['m1'],
        },
      });

      const result = await service.fetchRelationshipObservations(collection, 'm1');
      expect(result).toEqual(['Valid observation']);
    });
  });

  // ── Nearest-Neighbor Scores ─────────────────────────────────────────

  describe('fetchNearestNeighborScores', () => {
    it('returns scored neighbor memories', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: { doc_type: 'memory', content: 'Target memory' },
      });

      await collection.data.insert({
        id: 'm2',
        properties: {
          doc_type: 'memory',
          content: 'Similar memory about music',
          total_significance: 0.8,
          feel_happiness: 0.7,
          functional_salience: 0.5,
        },
      });

      const result = await service.fetchNearestNeighborScores(collection, 'm1');
      expect(result.length).toBeGreaterThan(0);
      const neighbor = result.find(n => n.scores.feel_happiness === 0.7);
      expect(neighbor).toBeDefined();
    });

    it('filters out unscored memories', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: { doc_type: 'memory', content: 'Target' },
      });
      await collection.data.insert({
        id: 'm2',
        properties: { doc_type: 'memory', content: 'Unscored' },
      });

      const result = await service.fetchNearestNeighborScores(collection, 'm1');
      expect(result).toHaveLength(0);
    });

    it('returns empty array when no scored neighbors exist', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: { doc_type: 'memory', content: 'Lonely memory' },
      });

      const result = await service.fetchNearestNeighborScores(collection, 'm1');
      expect(result).toEqual([]);
    });

    it('truncates content preview to 100 chars', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: { doc_type: 'memory', content: 'Target' },
      });

      const longContent = 'A'.repeat(200);
      await collection.data.insert({
        id: 'm2',
        properties: {
          doc_type: 'memory',
          content: longContent,
          total_significance: 0.5,
          feel_happiness: 0.3,
        },
      });

      const result = await service.fetchNearestNeighborScores(collection, 'm1');
      if (result.length > 0) {
        expect(result[0].content_preview.length).toBeLessThanOrEqual(100);
      }
    });

    it('respects custom limit', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: { doc_type: 'memory', content: 'Target' },
      });

      for (let i = 2; i <= 10; i++) {
        await collection.data.insert({
          id: `m${i}`,
          properties: {
            doc_type: 'memory',
            content: `Memory ${i}`,
            total_significance: 0.5,
            feel_happiness: 0.3,
          },
        });
      }

      const result = await service.fetchNearestNeighborScores(collection, 'm1', { limit: 3 });
      expect(result.length).toBeLessThanOrEqual(3);
    });
  });

  // ── Collection Stats Cache ──────────────────────────────────────────

  describe('createCollectionStatsCache', () => {
    it('returns undefined for unknown collection', () => {
      expect(statsCache.get('unknown')).toBeUndefined();
    });

    it('stores and retrieves stats', () => {
      const stats = { feel_happiness: 0.5 };
      statsCache.set('col1', stats);
      expect(statsCache.get('col1')).toEqual(stats);
    });

    it('invalidates specific collection', () => {
      statsCache.set('col1', { feel_happiness: 0.5 });
      statsCache.set('col2', { feel_sadness: 0.3 });
      statsCache.invalidate('col1');
      expect(statsCache.get('col1')).toBeUndefined();
      expect(statsCache.get('col2')).toBeDefined();
    });

    it('invalidates all collections', () => {
      statsCache.set('col1', { feel_happiness: 0.5 });
      statsCache.set('col2', { feel_sadness: 0.3 });
      statsCache.invalidateAll();
      expect(statsCache.get('col1')).toBeUndefined();
      expect(statsCache.get('col2')).toBeUndefined();
    });
  });

  // ── Collection Averages ─────────────────────────────────────────────

  describe('computeCollectionAverages', () => {
    it('computes averages across scored memories', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: {
          doc_type: 'memory',
          total_significance: 1.0,
          feel_happiness: 0.8,
          feel_sadness: 0.2,
        },
      });
      await collection.data.insert({
        id: 'm2',
        properties: {
          doc_type: 'memory',
          total_significance: 0.5,
          feel_happiness: 0.4,
          feel_sadness: 0.6,
        },
      });

      const result = await service.computeCollectionAverages(collection, statsCache, 'test-col');
      expect(result.feel_happiness).toBeCloseTo(0.6);
      expect(result.feel_sadness).toBeCloseTo(0.4);
    });

    it('ignores null values in average computation', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: {
          doc_type: 'memory',
          total_significance: 1.0,
          feel_happiness: 0.8,
        },
      });
      await collection.data.insert({
        id: 'm2',
        properties: {
          doc_type: 'memory',
          total_significance: 0.5,
          feel_happiness: 0.4,
          feel_sadness: 0.6,
        },
      });

      const result = await service.computeCollectionAverages(collection, statsCache, 'test-col');
      expect(result.feel_happiness).toBeCloseTo(0.6);
      expect(result.feel_sadness).toBeCloseTo(0.6);
    });

    it('returns empty object for collection with no scored memories', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: { doc_type: 'memory', content: 'unscored' },
      });

      const result = await service.computeCollectionAverages(collection, statsCache, 'empty-col');
      expect(result).toEqual({});
    });

    it('caches result and reuses on second call', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: {
          doc_type: 'memory',
          total_significance: 1.0,
          feel_happiness: 0.8,
        },
      });

      const result1 = await service.computeCollectionAverages(collection, statsCache, 'cached-col');
      expect(result1.feel_happiness).toBeCloseTo(0.8);

      await collection.data.insert({
        id: 'm2',
        properties: {
          doc_type: 'memory',
          total_significance: 0.5,
          feel_happiness: 0.2,
        },
      });

      const result2 = await service.computeCollectionAverages(collection, statsCache, 'cached-col');
      expect(result2.feel_happiness).toBeCloseTo(0.8); // cached value
    });

    it('recomputes after cache invalidation', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: {
          doc_type: 'memory',
          total_significance: 1.0,
          feel_happiness: 0.8,
        },
      });

      await service.computeCollectionAverages(collection, statsCache, 'inv-col');

      await collection.data.insert({
        id: 'm2',
        properties: {
          doc_type: 'memory',
          total_significance: 0.5,
          feel_happiness: 0.2,
        },
      });

      statsCache.invalidate('inv-col');
      const result = await service.computeCollectionAverages(collection, statsCache, 'inv-col');
      expect(result.feel_happiness).toBeCloseTo(0.5);
    });
  });

  // ── gatherScoringContext ────────────────────────────────────────────

  describe('gatherScoringContext', () => {
    it('assembles all three context sources', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: {
          doc_type: 'memory',
          content: 'Target memory',
        },
      });
      await collection.data.insert({
        id: 'rel-1',
        properties: {
          doc_type: 'relationship',
          related_memory_ids: ['m1', 'm2'],
          observation: 'Both about coding',
        },
      });
      await collection.data.insert({
        id: 'm2',
        properties: {
          doc_type: 'memory',
          content: 'Scored neighbor',
          total_significance: 0.8,
          feel_happiness: 0.7,
        },
      });

      const result = await service.gatherScoringContext(
        collection, 'test-col', 'm1', statsCache,
      );

      expect(result.relationship_observations).toContain('Both about coding');
      expect(Object.keys(result.collection_averages).length).toBeGreaterThan(0);
    });

    it('handles empty context gracefully', async () => {
      await collection.data.insert({
        id: 'm1',
        properties: { doc_type: 'memory', content: 'Lonely memory' },
      });

      const result = await service.gatherScoringContext(
        collection, 'empty-col', 'm1', statsCache,
      );

      expect(result.relationship_observations).toEqual([]);
      expect(result.nearest_neighbor_scores).toEqual({});
      expect(result.collection_averages).toEqual({});
    });
  });
});
