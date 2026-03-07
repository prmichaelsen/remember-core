import {
  recencyScore,
  normalizedRating,
  engagementScore,
  clusterQualityScore,
  normalizedEditorial,
  pageRank,
  computeCuratedScore,
  CURATED_WEIGHTS,
} from './curation-scoring';

describe('curation-scoring', () => {
  describe('CURATED_WEIGHTS', () => {
    it('sum to 1.0', () => {
      const sum = Object.values(CURATED_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 10);
    });
  });

  describe('recencyScore', () => {
    it('returns 1.0 for brand new memory', () => {
      expect(recencyScore(new Date())).toBeCloseTo(1.0, 2);
    });

    it('returns ~0.5 for 90-day-old memory (default half-life)', () => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      expect(recencyScore(ninetyDaysAgo)).toBeCloseTo(0.5, 1);
    });

    it('returns ~0.25 for 180-day-old memory', () => {
      const oneEightyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
      expect(recencyScore(oneEightyDaysAgo)).toBeCloseTo(0.25, 1);
    });

    it('accepts string dates', () => {
      const score = recencyScore(new Date().toISOString());
      expect(score).toBeCloseTo(1.0, 2);
    });

    it('returns 1.0 for future dates', () => {
      const future = new Date(Date.now() + 1000000);
      expect(recencyScore(future)).toBe(1.0);
    });

    it('respects custom half-life', () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      expect(recencyScore(thirtyDaysAgo, 30)).toBeCloseTo(0.5, 1);
    });
  });

  describe('normalizedRating', () => {
    it('returns 0.5 for unrated (Bayesian prior 3.0)', () => {
      expect(normalizedRating(3.0)).toBe(0.5);
    });

    it('returns 1.0 for perfect 5-star', () => {
      expect(normalizedRating(5.0)).toBe(1.0);
    });

    it('returns 0.0 for 1-star', () => {
      expect(normalizedRating(1.0)).toBe(0.0);
    });

    it('clamps below 0', () => {
      expect(normalizedRating(0.5)).toBe(0);
    });

    it('clamps above 1', () => {
      expect(normalizedRating(6.0)).toBe(1);
    });
  });

  describe('engagementScore', () => {
    it('returns 0 for no engagement', () => {
      expect(engagementScore(0, 0, 0)).toBe(0);
    });

    it('returns 1.0 when all caps exceeded', () => {
      expect(engagementScore(100, 50, 100)).toBeCloseTo(1.0, 5);
    });

    it('caps clicks at 50', () => {
      const capped = engagementScore(50, 0, 0);
      const exceeded = engagementScore(100, 0, 0);
      expect(capped).toBe(exceeded);
      expect(capped).toBeCloseTo(0.4, 5); // 1.0 * 0.4
    });

    it('caps shares at 10', () => {
      const capped = engagementScore(0, 10, 0);
      const exceeded = engagementScore(0, 20, 0);
      expect(capped).toBe(exceeded);
      expect(capped).toBeCloseTo(0.3, 5); // 1.0 * 0.3
    });

    it('caps comments at 20', () => {
      const capped = engagementScore(0, 0, 20);
      const exceeded = engagementScore(0, 0, 40);
      expect(capped).toBe(exceeded);
      expect(capped).toBeCloseTo(0.3, 5); // 1.0 * 0.3
    });
  });

  describe('clusterQualityScore', () => {
    it('returns 0 for no memberships', () => {
      expect(clusterQualityScore([])).toBe(0);
    });

    it('returns weighted average for single membership', () => {
      const score = clusterQualityScore([{ strength: 0.8, confidence: 0.9 }]);
      // 0.8 * 0.4 + 0.9 * 0.4 + min(1/10, 1) * 0.2 = 0.32 + 0.36 + 0.02 = 0.7
      expect(score).toBeCloseTo(0.7, 5);
    });

    it('caps membership bonus at 10 clusters', () => {
      const memberships = Array.from({ length: 15 }, () => ({ strength: 1.0, confidence: 1.0 }));
      const score = clusterQualityScore(memberships);
      // 1.0 * 0.4 + 1.0 * 0.4 + 1.0 * 0.2 = 1.0
      expect(score).toBeCloseTo(1.0, 5);
    });

    it('averages strength and confidence across clusters', () => {
      const memberships = [
        { strength: 0.6, confidence: 0.8 },
        { strength: 0.4, confidence: 0.6 },
      ];
      // avg strength 0.5, avg confidence 0.7, bonus 0.04
      const score = clusterQualityScore(memberships);
      expect(score).toBeCloseTo(0.5 * 0.4 + 0.7 * 0.4 + 0.04, 5);
    });
  });

  describe('normalizedEditorial', () => {
    it('passes through valid scores', () => {
      expect(normalizedEditorial(0.7)).toBe(0.7);
    });

    it('returns 0 for unscored', () => {
      expect(normalizedEditorial(0)).toBe(0);
    });

    it('clamps to 1', () => {
      expect(normalizedEditorial(1.5)).toBe(1);
    });

    it('clamps to 0', () => {
      expect(normalizedEditorial(-0.5)).toBe(0);
    });
  });

  describe('pageRank', () => {
    it('returns empty map for empty graph', () => {
      const result = pageRank([], []);
      expect(result.size).toBe(0);
    });

    it('gives equal scores to disconnected nodes', () => {
      const result = pageRank(['a', 'b', 'c'], []);
      // All disconnected → uniform distribution → all normalized to 1.0
      expect(result.get('a')).toBeCloseTo(1.0, 5);
      expect(result.get('b')).toBeCloseTo(1.0, 5);
      expect(result.get('c')).toBeCloseTo(1.0, 5);
    });

    it('gives higher score to hub nodes', () => {
      // Star graph: A connects to B, C, D
      const result = pageRank(
        ['a', 'b', 'c', 'd'],
        [
          { source_id: 'a', target_id: 'b' },
          { source_id: 'a', target_id: 'c' },
          { source_id: 'a', target_id: 'd' },
        ],
      );
      // A should have highest score (hub)
      expect(result.get('a')!).toBeGreaterThan(result.get('b')!);
      expect(result.get('a')!).toBeGreaterThan(result.get('c')!);
    });

    it('normalizes max to 1.0', () => {
      const result = pageRank(
        ['a', 'b'],
        [{ source_id: 'a', target_id: 'b' }],
      );
      const maxScore = Math.max(...result.values());
      expect(maxScore).toBeCloseTo(1.0, 5);
    });

    it('converges for circular graph', () => {
      const result = pageRank(
        ['a', 'b', 'c'],
        [
          { source_id: 'a', target_id: 'b' },
          { source_id: 'b', target_id: 'c' },
          { source_id: 'c', target_id: 'a' },
        ],
      );
      // All nodes in a cycle → equal scores
      expect(result.get('a')).toBeCloseTo(result.get('b')!, 2);
      expect(result.get('b')).toBeCloseTo(result.get('c')!, 2);
    });

    it('handles single node', () => {
      const result = pageRank(['a'], []);
      expect(result.get('a')).toBe(1.0);
    });
  });

  describe('computeCuratedScore', () => {
    it('returns 1.0 for perfect scores', () => {
      expect(computeCuratedScore({
        editorial: 1.0,
        cluster_quality: 1.0,
        graph_centrality: 1.0,
        rating: 1.0,
        recency: 1.0,
        engagement: 1.0,
      })).toBeCloseTo(1.0, 5);
    });

    it('returns 0.0 for zero scores', () => {
      expect(computeCuratedScore({
        editorial: 0,
        cluster_quality: 0,
        graph_centrality: 0,
        rating: 0,
        recency: 0,
        engagement: 0,
      })).toBe(0);
    });

    it('applies correct weights', () => {
      // Only editorial = 1.0, rest 0
      expect(computeCuratedScore({
        editorial: 1.0,
        cluster_quality: 0,
        graph_centrality: 0,
        rating: 0,
        recency: 0,
        engagement: 0,
      })).toBeCloseTo(0.30, 5);

      // Only cluster_quality = 1.0
      expect(computeCuratedScore({
        editorial: 0,
        cluster_quality: 1.0,
        graph_centrality: 0,
        rating: 0,
        recency: 0,
        engagement: 0,
      })).toBeCloseTo(0.25, 5);
    });

    it('produces value in [0, 1] for arbitrary valid inputs', () => {
      const score = computeCuratedScore({
        editorial: 0.7,
        cluster_quality: 0.3,
        graph_centrality: 0.5,
        rating: 0.8,
        recency: 0.4,
        engagement: 0.1,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });
});
