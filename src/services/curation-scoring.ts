/**
 * Curation scoring — sub-score functions and composite weight constants.
 *
 * Each sub-score function normalizes a quality signal to [0.0, 1.0].
 * The composite curated_score is a weighted sum of all 6 sub-scores.
 */

// ── Weight Constants ──

export const CURATED_WEIGHTS = {
  editorial: 0.30,
  cluster_quality: 0.25,
  graph_centrality: 0.20,
  rating: 0.12,
  recency: 0.08,
  engagement: 0.05,
} as const;

// ── Sub-Score Interfaces ──

export interface CuratedSubScores {
  memory_id: string;
  collection_id: string;
  editorial: number;
  cluster_quality: number;
  graph_centrality: number;
  rating: number;
  recency: number;
  engagement: number;
  composite: number;
  scored_at: string;
}

export interface RelationshipEdge {
  source_id: string;
  target_id: string;
}

export interface ClusterMembership {
  strength: number;
  confidence: number;
}

// ── Sub-Score Functions ──

/**
 * Recency score using exponential decay.
 * Half-life of 90 days: a 90-day-old memory scores 0.5.
 */
export function recencyScore(createdAt: Date | string, halfLifeDays = 90): number {
  const created = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  const ageMs = Date.now() - created.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays <= 0) return 1.0;
  return Math.exp(-0.693 * ageDays / halfLifeDays);
}

/**
 * Normalize Bayesian rating to [0, 1].
 * rating_bayesian = (sum + 15) / (count + 5), range ~1.0-5.0.
 * Unrated memories get 3.0 → 0.5 (neutral).
 */
export function normalizedRating(ratingBayesian: number): number {
  return Math.max(0, Math.min(1, (ratingBayesian - 1) / 4));
}

/**
 * Engagement score from click/share/comment counts.
 * Each signal is capped to prevent viral dominance.
 */
export function engagementScore(
  clickCount: number,
  shareCount: number,
  commentCount: number,
): number {
  const clickScore = Math.min(clickCount / 50, 1.0);
  const shareScore = Math.min(shareCount / 10, 1.0);
  const commentScore = Math.min(commentCount / 20, 1.0);
  return clickScore * 0.4 + shareScore * 0.3 + commentScore * 0.3;
}

/**
 * Cluster quality score from REM cluster memberships.
 * Aggregates average strength + confidence + membership bonus.
 */
export function clusterQualityScore(memberships: ClusterMembership[]): number {
  if (memberships.length === 0) return 0;

  const avgStrength = memberships.reduce((s, m) => s + m.strength, 0) / memberships.length;
  const avgConfidence = memberships.reduce((s, m) => s + m.confidence, 0) / memberships.length;
  const membershipBonus = Math.min(memberships.length / 10, 1.0);

  return avgStrength * 0.4 + avgConfidence * 0.4 + membershipBonus * 0.2;
}

/**
 * Editorial score pass-through (already 0.0-1.0 from Haiku).
 * Returns 0 for unscored memories.
 */
export function normalizedEditorial(editorialScore: number): number {
  return Math.max(0, Math.min(1, editorialScore));
}

/**
 * Simplified PageRank on a relationship graph.
 * Returns a map of memory_id → normalized centrality score [0, 1].
 *
 * For scaling: limit input to top N memories by relationship_count.
 */
export function pageRank(
  memoryIds: string[],
  edges: RelationshipEdge[],
  iterations = 20,
  damping = 0.85,
): Map<string, number> {
  const N = memoryIds.length;
  if (N === 0) return new Map();

  const scores = new Map<string, number>();
  for (const id of memoryIds) scores.set(id, 1 / N);

  // Pre-compute outgoing edges per node
  const outgoing = new Map<string, string[]>();
  for (const id of memoryIds) outgoing.set(id, []);
  for (const { source_id, target_id } of edges) {
    if (outgoing.has(source_id)) {
      outgoing.get(source_id)!.push(target_id);
    }
    // Bidirectional
    if (outgoing.has(target_id)) {
      outgoing.get(target_id)!.push(source_id);
    }
  }

  for (let i = 0; i < iterations; i++) {
    const newScores = new Map<string, number>();
    for (const id of memoryIds) newScores.set(id, (1 - damping) / N);

    for (const id of memoryIds) {
      const targets = outgoing.get(id)!;
      if (targets.length === 0) continue;
      const share = damping * scores.get(id)! / targets.length;
      for (const target of targets) {
        if (newScores.has(target)) {
          newScores.set(target, newScores.get(target)! + share);
        }
      }
    }

    for (const [id, s] of newScores) scores.set(id, s);
  }

  // Normalize to [0, 1]
  let max = 0;
  for (const s of scores.values()) {
    if (s > max) max = s;
  }
  if (max > 0) {
    for (const [id, s] of scores) scores.set(id, s / max);
  }

  return scores;
}

// ── Composite Score ──

/**
 * Compute the weighted composite curated_score from 6 sub-scores.
 * All inputs must be in [0.0, 1.0]. Result is in [0.0, 1.0].
 */
export function computeCuratedScore(subScores: {
  editorial: number;
  cluster_quality: number;
  graph_centrality: number;
  rating: number;
  recency: number;
  engagement: number;
}): number {
  return (
    CURATED_WEIGHTS.editorial * subScores.editorial +
    CURATED_WEIGHTS.cluster_quality * subScores.cluster_quality +
    CURATED_WEIGHTS.graph_centrality * subScores.graph_centrality +
    CURATED_WEIGHTS.rating * subScores.rating +
    CURATED_WEIGHTS.recency * subScores.recency +
    CURATED_WEIGHTS.engagement * subScores.engagement
  );
}
