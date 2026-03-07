/**
 * Curation Storage Service — Firestore persistence for curated sub-scores
 * and batch scoring orchestration.
 */

import { getDocument, setDocument } from '../database/firestore/init.js';
import { getCuratedScorePath } from '../database/firestore/paths.js';
import {
  computeCuratedScore,
  recencyScore,
  normalizedRating,
  engagementScore,
  clusterQualityScore,
  normalizedEditorial,
  type CuratedSubScores,
  type ClusterMembership,
} from './curation-scoring.js';

// ── Types ──

export interface MemoryWithProperties {
  id: string;
  collection_id: string;
  created_at: string;
  rating_bayesian?: number;
  editorial_score?: number;
  click_count?: number;
  share_count?: number;
  comment_count?: number;
}

export interface BatchScoringInput {
  memories: MemoryWithProperties[];
  pageRankScores: Map<string, number>;
  clusterMemberships: Map<string, ClusterMembership[]>;
  collectionId: string;
}

export interface BatchScoringResult {
  scored: number;
  results: CuratedSubScores[];
}

// ── Firestore Operations ──

export async function storeCuratedSubScores(subScores: CuratedSubScores): Promise<void> {
  const { collectionPath, docId } = getCuratedScorePath(subScores.collection_id, subScores.memory_id);
  await setDocument(collectionPath, docId, subScores);
}

export async function getCuratedSubScores(
  collectionId: string,
  memoryId: string,
): Promise<CuratedSubScores | null> {
  const { collectionPath, docId } = getCuratedScorePath(collectionId, memoryId);
  const doc = await getDocument(collectionPath, docId);
  return (doc as CuratedSubScores) ?? null;
}

// ── Batch Scoring ──

export function computeSubScoresForMemory(
  memory: MemoryWithProperties,
  pageRankScores: Map<string, number>,
  clusterMemberships: Map<string, ClusterMembership[]>,
): CuratedSubScores {
  const editorial = normalizedEditorial(memory.editorial_score ?? 0);
  const clusters = clusterMemberships.get(memory.id) ?? [];
  const cluster_quality = clusterQualityScore(clusters);
  const graph_centrality = pageRankScores.get(memory.id) ?? 0;
  const rating = normalizedRating(memory.rating_bayesian ?? 3.0);
  const recency = recencyScore(memory.created_at);
  const engagement = engagementScore(
    memory.click_count ?? 0,
    memory.share_count ?? 0,
    memory.comment_count ?? 0,
  );

  const composite = computeCuratedScore({
    editorial,
    cluster_quality,
    graph_centrality,
    rating,
    recency,
    engagement,
  });

  return {
    memory_id: memory.id,
    collection_id: memory.collection_id,
    editorial,
    cluster_quality,
    graph_centrality,
    rating,
    recency,
    engagement,
    composite,
    scored_at: new Date().toISOString(),
  };
}

export async function scoreBatch(
  input: BatchScoringInput,
): Promise<BatchScoringResult> {
  const results: CuratedSubScores[] = [];

  for (const memory of input.memories) {
    const subScores = computeSubScoresForMemory(
      memory,
      input.pageRankScores,
      input.clusterMemberships,
    );
    results.push(subScores);
  }

  return { scored: results.length, results };
}
