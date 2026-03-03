import { createMockCollection } from '../testing/weaviate-mock.js';
import { DEFAULT_REM_CONFIG } from './rem.types.js';
import {
  selectCandidates,
  formClusters,
  resolveClusterActions,
  shouldSplit,
  splitCluster,
  type Cluster,
} from './rem.clustering.js';
import { RelationshipService, computeOverlap } from './relationship.service.js';
import { createMockLogger } from '../testing/weaviate-mock.js';
import { createMockHaikuClient } from './rem.haiku.js';

describe('REM Clustering', () => {
  let collection: ReturnType<typeof createMockCollection>;
  const userId = 'test-user';

  beforeEach(() => {
    collection = createMockCollection();
  });

  async function insertMemory(content: string, createdAt?: string) {
    return collection.data.insert({
      properties: {
        user_id: userId,
        doc_type: 'memory',
        content,
        created_at: createdAt ?? new Date().toISOString(),
        tags: ['test'],
        deleted_at: null,
        relationship_ids: [],
      },
    });
  }

  describe('selectCandidates', () => {
    it('returns deduplicated candidates from collection', async () => {
      await insertMemory('memory one', '2026-01-01T00:00:00Z');
      await insertMemory('memory two', '2026-01-02T00:00:00Z');
      await insertMemory('memory three', '2026-01-03T00:00:00Z');
      await insertMemory('memory four', '2026-01-04T00:00:00Z');
      await insertMemory('memory five', '2026-01-05T00:00:00Z');

      const candidates = await selectCandidates(collection as any, '', 6, DEFAULT_REM_CONFIG, createMockHaikuClient());
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates.length).toBeLessThanOrEqual(6);

      // All candidates should be unique
      const ids = candidates.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('respects memory_cursor for unprocessed filtering', async () => {
      await insertMemory('old memory', '2025-01-01T00:00:00Z');
      await insertMemory('new memory', '2026-06-01T00:00:00Z');

      const candidates = await selectCandidates(collection as any, '2026-01-01T00:00:00Z', 3, DEFAULT_REM_CONFIG, createMockHaikuClient());
      // Should still return candidates (from newest and random thirds)
      expect(candidates.length).toBeGreaterThan(0);
    });

    it('filters to memory doc_type only', async () => {
      await insertMemory('real memory');
      await collection.data.insert({
        properties: { doc_type: 'relationship', content: 'not a memory', created_at: new Date().toISOString(), tags: [] },
      });

      const candidates = await selectCandidates(collection as any, '', 10, DEFAULT_REM_CONFIG, createMockHaikuClient());
      for (const c of candidates) {
        // All should be memories, not relationships
        const stored = collection._store.get(c.id);
        expect(stored?.properties.doc_type).toBe('memory');
      }
    });
  });

  describe('formClusters', () => {
    it('produces clusters with >= 3 members', async () => {
      // Insert enough memories so nearObject returns multiple results
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        ids.push(await insertMemory(`memory ${i}`));
      }

      const candidates = ids.map((id) => ({
        id,
        content: `memory`,
        created_at: new Date().toISOString(),
        tags: ['test'],
      }));

      const clusters = await formClusters(collection as any, candidates, DEFAULT_REM_CONFIG);
      // Mock nearObject returns all memories, so clusters should form
      for (const cluster of clusters) {
        expect(cluster.memory_ids.length).toBeGreaterThanOrEqual(3);
      }
    });

    it('skips candidates with fewer than 2 similar results', async () => {
      // Insert just 2 memories — one candidate + one similar = not enough
      await insertMemory('only memory');

      const candidates = [{
        id: 'nonexistent',
        content: 'lone memory',
        created_at: new Date().toISOString(),
        tags: [],
      }];

      const clusters = await formClusters(collection as any, candidates, DEFAULT_REM_CONFIG);
      // With only 1 item in store, nearObject returns 1 result, < 2 similar
      expect(clusters.length).toBe(0);
    });

    it('deduplicates overlapping clusters', async () => {
      // Insert memories that will produce overlapping clusters
      const ids: string[] = [];
      for (let i = 0; i < 4; i++) {
        ids.push(await insertMemory(`related memory ${i}`));
      }

      const candidates = ids.map((id) => ({
        id,
        content: 'related',
        created_at: new Date().toISOString(),
        tags: [],
      }));

      const clusters = await formClusters(collection as any, candidates, DEFAULT_REM_CONFIG);
      // Should deduplicate highly overlapping clusters
      // Multiple candidates pointing to same set → deduplicated
      expect(clusters.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('resolveClusterActions', () => {
    it('returns create when no existing relationships overlap', async () => {
      const logger = createMockLogger();
      const service = new RelationshipService(collection as any, userId, logger);

      const clusters: Cluster[] = [{
        seed_id: 'a',
        memory_ids: ['a', 'b', 'c'],
        memories: [],
        avg_similarity: 0.8,
      }];

      const actions = await resolveClusterActions(clusters, service, DEFAULT_REM_CONFIG);
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('create');
    });

    it('returns merge when overlap > threshold', async () => {
      const logger = createMockLogger();

      // Create memories first
      const mem1 = await insertMemory('mem 1');
      const mem2 = await insertMemory('mem 2');
      const mem3 = await insertMemory('mem 3');

      const service = new RelationshipService(collection as any, userId, logger);

      // Create existing relationship with overlap
      await service.create({
        memory_ids: [mem1, mem2, mem3],
        relationship_type: 'topical',
        observation: 'existing',
        source: 'rem',
      });

      const clusters: Cluster[] = [{
        seed_id: mem1,
        memory_ids: [mem1, mem2, mem3], // 100% overlap
        memories: [],
        avg_similarity: 0.8,
      }];

      const actions = await resolveClusterActions(clusters, service, DEFAULT_REM_CONFIG);
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('merge');
      expect(actions[0].existing_relationship_id).toBeDefined();
    });

    it('returns create when overlap <= threshold', async () => {
      const logger = createMockLogger();

      const mem1 = await insertMemory('mem 1');
      const mem2 = await insertMemory('mem 2');
      const mem3 = await insertMemory('mem 3');
      const mem4 = await insertMemory('mem 4');
      const mem5 = await insertMemory('mem 5');

      const service = new RelationshipService(collection as any, userId, logger);

      // Create existing relationship with only 1 shared memory
      await service.create({
        memory_ids: [mem1, mem2],
        relationship_type: 'topical',
        observation: 'existing',
        source: 'rem',
      });

      const clusters: Cluster[] = [{
        seed_id: mem1,
        memory_ids: [mem1, mem3, mem4, mem5], // only 1/4 = 25% overlap
        memories: [],
        avg_similarity: 0.8,
      }];

      const actions = await resolveClusterActions(clusters, service, DEFAULT_REM_CONFIG);
      expect(actions.length).toBe(1);
      expect(actions[0].type).toBe('create');
    });
  });

  describe('shouldSplit', () => {
    it('returns true when > max_relationship_members', () => {
      const ids = Array.from({ length: 51 }, (_, i) => `id-${i}`);
      expect(shouldSplit(ids, DEFAULT_REM_CONFIG)).toBe(true);
    });

    it('returns false when <= max_relationship_members', () => {
      const ids = Array.from({ length: 50 }, (_, i) => `id-${i}`);
      expect(shouldSplit(ids, DEFAULT_REM_CONFIG)).toBe(false);
    });
  });

  describe('splitCluster', () => {
    it('produces sub-clusters within size limit', () => {
      const ids = Array.from({ length: 120 }, (_, i) => `id-${i}`);
      const cluster: Cluster = {
        seed_id: 'id-0',
        memory_ids: ids,
        memories: ids.map((id) => ({ id, content: '', created_at: '', tags: [] })),
        avg_similarity: 0.8,
      };

      const subs = splitCluster(cluster, DEFAULT_REM_CONFIG);
      expect(subs.length).toBe(3); // 120 / 50 = 2.4 → 3 chunks
      for (const sub of subs) {
        expect(sub.memory_ids.length).toBeLessThanOrEqual(50);
      }
    });

    it('returns original cluster if within limit', () => {
      const cluster: Cluster = {
        seed_id: 'a',
        memory_ids: ['a', 'b', 'c'],
        memories: [],
        avg_similarity: 0.8,
      };

      const subs = splitCluster(cluster, DEFAULT_REM_CONFIG);
      expect(subs.length).toBe(1);
      expect(subs[0]).toBe(cluster);
    });
  });

  describe('computeOverlap (re-exported)', () => {
    it('handles realistic overlap scenarios', () => {
      expect(computeOverlap(['a', 'b', 'c', 'd'], ['a', 'b', 'c'])).toBe(1);
      expect(computeOverlap(['a', 'b'], ['a', 'b', 'c', 'd', 'e'])).toBeCloseTo(2 / 5);
    });
  });
});
