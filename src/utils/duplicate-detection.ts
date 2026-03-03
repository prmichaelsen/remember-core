/**
 * Duplicate detection utilities for memories.
 *
 * Provides multiple strategies for finding duplicate or near-duplicate
 * memories within a collection.
 */

import type { Memory } from '../types/memory.types.js';

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * Memory with optional embedding vector (from Weaviate query results).
 */
export type MemoryWithEmbedding = Memory & {
  embedding?: number[];
};

export interface DuplicateCandidate {
  memory1: MemoryWithEmbedding;
  memory2: MemoryWithEmbedding;
  similarity: number;
  reasons: string[];
  strategy: 'exact' | 'normalized' | 'embedding' | 'fuzzy';
}

export interface DuplicateGroup {
  memories: MemoryWithEmbedding[];
  primary: MemoryWithEmbedding; // Suggested memory to keep
  similarity: number;
  reasons: string[];
}

export interface DuplicateDetectionOptions {
  /** Minimum embedding similarity for duplicate detection (default: 0.95) */
  embeddingSimilarityThreshold?: number;
  /** Minimum fuzzy similarity ratio (default: 0.90) */
  fuzzySimilarityThreshold?: number;
  /** Check exact content matches (default: true) */
  checkExact?: boolean;
  /** Check normalized content (trim, lowercase) (default: true) */
  checkNormalized?: boolean;
  /** Check embedding similarity (default: true) */
  checkEmbedding?: boolean;
  /** Check fuzzy string similarity (default: true) */
  checkFuzzy?: boolean;
}

// ─── Normalization ───────────────────────────────────────────────────────

function normalizeContent(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ─── Similarity Metrics ──────────────────────────────────────────────────

/**
 * Cosine similarity between two embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Fuzzy string similarity ratio (0-1) using Levenshtein distance.
 */
export function fuzzySimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

// ─── Duplicate Detection ─────────────────────────────────────────────────

/**
 * Check if two memories are exact duplicates.
 */
export function isExactDuplicate(m1: MemoryWithEmbedding, m2: MemoryWithEmbedding): boolean {
  return m1.content === m2.content;
}

/**
 * Check if two memories are normalized duplicates (ignoring whitespace, case).
 */
export function isNormalizedDuplicate(m1: MemoryWithEmbedding, m2: MemoryWithEmbedding): boolean {
  return normalizeContent(m1.content) === normalizeContent(m2.content);
}

/**
 * Check if two memories are embedding duplicates (high cosine similarity).
 */
export function isEmbeddingDuplicate(
  m1: MemoryWithEmbedding,
  m2: MemoryWithEmbedding,
  threshold = 0.95
): boolean {
  if (!m1.embedding || !m2.embedding) return false;
  return cosineSimilarity(m1.embedding, m2.embedding) >= threshold;
}

/**
 * Check if two memories are fuzzy duplicates (high string similarity).
 */
export function isFuzzyDuplicate(
  m1: MemoryWithEmbedding,
  m2: MemoryWithEmbedding,
  threshold = 0.90
): boolean {
  return fuzzySimilarity(m1.content, m2.content) >= threshold;
}

/**
 * Find all duplicate candidates in a collection of memories.
 * Returns pairs of memories that match duplicate criteria.
 */
export function findDuplicateCandidates(
  memories: MemoryWithEmbedding[],
  options: DuplicateDetectionOptions = {}
): DuplicateCandidate[] {
  const {
    embeddingSimilarityThreshold = 0.95,
    fuzzySimilarityThreshold = 0.90,
    checkExact = true,
    checkNormalized = true,
    checkEmbedding = true,
    checkFuzzy = true,
  } = options;

  const candidates: DuplicateCandidate[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const m1 = memories[i];
      const m2 = memories[j];

      // Skip if we've already paired these
      const pairKey = [m1.id, m2.id].sort().join('|');
      if (seen.has(pairKey)) continue;

      const reasons: string[] = [];
      let similarity = 0;
      let strategy: DuplicateCandidate['strategy'] = 'fuzzy';

      // Check exact match
      if (checkExact && isExactDuplicate(m1, m2)) {
        reasons.push('Exact content match');
        similarity = 1.0;
        strategy = 'exact';
      }

      // Check normalized match
      if (checkNormalized && isNormalizedDuplicate(m1, m2)) {
        reasons.push('Normalized content match (case/whitespace)');
        similarity = Math.max(similarity, 0.98);
        if (strategy !== 'exact') strategy = 'normalized';
      }

      // Check embedding similarity
      if (checkEmbedding && m1.embedding && m2.embedding) {
        const embSim = cosineSimilarity(m1.embedding, m2.embedding);
        if (embSim >= embeddingSimilarityThreshold) {
          reasons.push(`High embedding similarity (${embSim.toFixed(3)})`);
          similarity = Math.max(similarity, embSim);
          if (strategy !== 'exact' && strategy !== 'normalized') {
            strategy = 'embedding';
          }
        }
      }

      // Check fuzzy match
      if (checkFuzzy) {
        const fuzzySim = fuzzySimilarity(m1.content, m2.content);
        if (fuzzySim >= fuzzySimilarityThreshold) {
          reasons.push(`High string similarity (${fuzzySim.toFixed(3)})`);
          similarity = Math.max(similarity, fuzzySim);
        }
      }

      // If any match found, add to candidates
      if (reasons.length > 0) {
        candidates.push({
          memory1: m1,
          memory2: m2,
          similarity,
          reasons,
          strategy,
        });
        seen.add(pairKey);
      }
    }
  }

  return candidates.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Group duplicate candidates into clusters.
 * Memories that are duplicates of each other are grouped together.
 */
export function groupDuplicates(
  candidates: DuplicateCandidate[]
): DuplicateGroup[] {
  // Build adjacency map
  const graph = new Map<string, Set<string>>();
  const memoryMap = new Map<string, Memory>();

  for (const candidate of candidates) {
    const id1 = candidate.memory1.id;
    const id2 = candidate.memory2.id;

    memoryMap.set(id1, candidate.memory1);
    memoryMap.set(id2, candidate.memory2);

    if (!graph.has(id1)) graph.set(id1, new Set());
    if (!graph.has(id2)) graph.set(id2, new Set());

    graph.get(id1)!.add(id2);
    graph.get(id2)!.add(id1);
  }

  // Find connected components (groups)
  const visited = new Set<string>();
  const groups: DuplicateGroup[] = [];

  function dfs(id: string, component: Set<string>) {
    if (visited.has(id)) return;
    visited.add(id);
    component.add(id);

    for (const neighbor of graph.get(id) || []) {
      dfs(neighbor, component);
    }
  }

  for (const id of graph.keys()) {
    if (!visited.has(id)) {
      const component = new Set<string>();
      dfs(id, component);

      if (component.size > 1) {
        const memories = Array.from(component)
          .map((id) => memoryMap.get(id)!)
          .filter(Boolean);

        // Choose primary: newest creation, or highest weight
        const primary = memories.reduce((best, curr) => {
          if (curr.weight > best.weight) return curr;
          if (curr.weight === best.weight && curr.created_at > best.created_at) {
            return curr;
          }
          return best;
        });

        // Calculate average similarity within group
        const pairCount = (memories.length * (memories.length - 1)) / 2;
        const totalSim = candidates
          .filter(
            (c) =>
              component.has(c.memory1.id) &&
              component.has(c.memory2.id)
          )
          .reduce((sum, c) => sum + c.similarity, 0);
        const avgSim = pairCount > 0 ? totalSim / pairCount : 0;

        // Collect all unique reasons
        const allReasons = new Set<string>();
        candidates
          .filter(
            (c) =>
              component.has(c.memory1.id) &&
              component.has(c.memory2.id)
          )
          .forEach((c) => c.reasons.forEach((r) => allReasons.add(r)));

        groups.push({
          memories,
          primary,
          similarity: avgSim,
          reasons: Array.from(allReasons),
        });
      }
    }
  }

  return groups.sort((a, b) => b.similarity - a.similarity);
}
