// Mock Firestore
jest.mock('../database/firestore/init.js', () => ({
  getDocument: jest.fn(),
  setDocument: jest.fn(),
}));

jest.mock('../database/firestore/paths.js', () => ({
  getCuratedScorePath: jest.fn((collectionId: string, memoryId: string) => ({
    collectionPath: `test.curated_scores/${collectionId}/memories`,
    docId: memoryId,
  })),
}));

import { getDocument, setDocument } from '../database/firestore/init.js';
import {
  storeCuratedSubScores,
  getCuratedSubScores,
  computeSubScoresForMemory,
  scoreBatch,
  type MemoryWithProperties,
} from './curation-storage.service.js';
import type { CuratedSubScores, ClusterMembership } from './curation-scoring.js';

describe('storeCuratedSubScores', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes sub-scores to the correct Firestore path', async () => {
    const subScores: CuratedSubScores = {
      memory_id: 'mem-1',
      collection_id: 'col-1',
      editorial: 0.8,
      cluster_quality: 0.6,
      graph_centrality: 0.5,
      rating: 0.5,
      recency: 0.9,
      engagement: 0.1,
      composite: 0.65,
      scored_at: '2026-03-07T00:00:00Z',
    };

    await storeCuratedSubScores(subScores);

    expect(setDocument).toHaveBeenCalledWith(
      'test.curated_scores/col-1/memories',
      'mem-1',
      subScores,
    );
  });
});

describe('getCuratedSubScores', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns sub-scores from Firestore', async () => {
    const stored = { memory_id: 'mem-1', composite: 0.65 };
    (getDocument as jest.Mock).mockResolvedValue(stored);

    const result = await getCuratedSubScores('col-1', 'mem-1');

    expect(getDocument).toHaveBeenCalledWith(
      'test.curated_scores/col-1/memories',
      'mem-1',
    );
    expect(result).toEqual(stored);
  });

  it('returns null for unscored memories', async () => {
    (getDocument as jest.Mock).mockResolvedValue(null);

    const result = await getCuratedSubScores('col-1', 'missing');
    expect(result).toBeNull();
  });

  it('returns null for undefined doc', async () => {
    (getDocument as jest.Mock).mockResolvedValue(undefined);

    const result = await getCuratedSubScores('col-1', 'missing');
    expect(result).toBeNull();
  });
});

describe('computeSubScoresForMemory', () => {
  const now = new Date().toISOString();

  it('computes all 6 sub-scores and composite', () => {
    const memory: MemoryWithProperties = {
      id: 'mem-1',
      collection_id: 'col-1',
      created_at: now,
      rating_bayesian: 4.0,
      editorial_score: 0.8,
      click_count: 25,
      share_count: 5,
      comment_count: 10,
    };

    const pageRank = new Map([['mem-1', 0.7]]);
    const clusters = new Map<string, ClusterMembership[]>([
      ['mem-1', [{ strength: 0.9, confidence: 0.8 }]],
    ]);

    const result = computeSubScoresForMemory(memory, pageRank, clusters);

    expect(result.memory_id).toBe('mem-1');
    expect(result.collection_id).toBe('col-1');
    expect(result.editorial).toBe(0.8);
    expect(result.graph_centrality).toBe(0.7);
    expect(result.rating).toBeCloseTo(0.75, 2);
    expect(result.recency).toBeCloseTo(1.0, 1); // just created
    expect(result.engagement).toBeGreaterThan(0);
    expect(result.cluster_quality).toBeGreaterThan(0);
    expect(result.composite).toBeGreaterThan(0);
    expect(result.composite).toBeLessThanOrEqual(1);
    expect(result.scored_at).toBeDefined();
  });

  it('uses defaults for missing optional properties', () => {
    const memory: MemoryWithProperties = {
      id: 'mem-2',
      collection_id: 'col-1',
      created_at: now,
    };

    const result = computeSubScoresForMemory(memory, new Map(), new Map());

    expect(result.editorial).toBe(0);
    expect(result.graph_centrality).toBe(0);
    expect(result.rating).toBeCloseTo(0.5, 2); // bayesian default 3.0 → 0.5
    expect(result.engagement).toBe(0);
    expect(result.cluster_quality).toBe(0);
  });

  it('composite of all zeros is 0', () => {
    const memory: MemoryWithProperties = {
      id: 'mem-3',
      collection_id: 'col-1',
      created_at: '2020-01-01T00:00:00Z', // very old
      rating_bayesian: 1.0,
      editorial_score: 0,
      click_count: 0,
      share_count: 0,
      comment_count: 0,
    };

    const result = computeSubScoresForMemory(memory, new Map(), new Map());

    expect(result.editorial).toBe(0);
    expect(result.cluster_quality).toBe(0);
    expect(result.graph_centrality).toBe(0);
    expect(result.rating).toBe(0);
    expect(result.engagement).toBe(0);
    // recency is very small but non-zero for old date
    expect(result.recency).toBeLessThan(0.01);
  });
});

describe('scoreBatch', () => {
  const now = new Date().toISOString();

  it('scores all memories in the batch', async () => {
    const memories: MemoryWithProperties[] = [
      { id: 'a', collection_id: 'col-1', created_at: now, editorial_score: 0.9 },
      { id: 'b', collection_id: 'col-1', created_at: now, editorial_score: 0.3 },
    ];

    const result = await scoreBatch({
      memories,
      pageRankScores: new Map([['a', 0.8], ['b', 0.2]]),
      clusterMemberships: new Map(),
      collectionId: 'col-1',
    });

    expect(result.scored).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].memory_id).toBe('a');
    expect(result.results[1].memory_id).toBe('b');
    expect(result.results[0].composite).toBeGreaterThan(result.results[1].composite);
  });

  it('returns empty for empty input', async () => {
    const result = await scoreBatch({
      memories: [],
      pageRankScores: new Map(),
      clusterMemberships: new Map(),
      collectionId: 'col-1',
    });

    expect(result.scored).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});
