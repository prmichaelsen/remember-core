/**
 * Curation Scoring Step — runs as Step 5 in the REM cycle.
 *
 * Gathers all 6 sub-scores (editorial, cluster quality, graph centrality,
 * rating, recency, engagement) for candidate memories, computes the composite
 * curated_score, and writes to Weaviate + Firestore.
 */

import type { EditorialScoringService } from './editorial-scoring.service.js';
import {
  pageRank,
  type RelationshipEdge,
  type ClusterMembership,
} from './curation-scoring.js';
import {
  computeSubScoresForMemory,
  storeCuratedSubScores,
  type MemoryWithProperties,
} from './curation-storage.service.js';

// ── Types ──

export interface CurationStepDeps {
  editorialService: EditorialScoringService;
  collection: any; // WeaviateCollection
  collectionId: string;
  logger?: any;
}

export interface CurationStepResult {
  memories_scored: number;
  editorial_evaluations: number;
  skipped: number;
}

export interface CurationMemory {
  uuid: string;
  properties: {
    content?: string;
    created_at?: string;
    rating_bayesian?: number;
    editorial_score?: number;
    click_count?: number;
    share_count?: number;
    comment_count?: number;
    relationship_count?: number;
  };
}

export interface CurationRelationship {
  source_memory_id: string;
  target_memory_id: string;
  strength?: number;
  confidence?: number;
}

// ── Step Runner ──

export async function runCurationStep(
  deps: CurationStepDeps,
  memories: CurationMemory[],
  relationships: CurationRelationship[],
): Promise<CurationStepResult> {
  const result: CurationStepResult = {
    memories_scored: 0,
    editorial_evaluations: 0,
    skipped: 0,
  };

  if (memories.length === 0) return result;

  // 5a. Editorial pass: evaluate memories without editorial_score
  const needsEditorial = memories.filter(
    (m) => !m.properties.editorial_score || m.properties.editorial_score === 0,
  );

  for (const memory of needsEditorial) {
    try {
      const editorial = await deps.editorialService.evaluate(memory.properties.content ?? '');
      memory.properties.editorial_score = editorial.score;
      result.editorial_evaluations++;
    } catch (err) {
      deps.logger?.warn?.('Editorial evaluation failed', {
        memoryId: memory.uuid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 5b/5c. Build relationship graph and run PageRank
  const memoryIds = memories.map((m) => m.uuid);
  const edges: RelationshipEdge[] = relationships.map((r) => ({
    source_id: r.source_memory_id,
    target_id: r.target_memory_id,
  }));
  const pageRankScores = pageRank(memoryIds, edges);

  // 5b. Cluster memberships from relationship strength/confidence
  const clusterMemberships = new Map<string, ClusterMembership[]>();
  for (const rel of relationships) {
    for (const memId of [rel.source_memory_id, rel.target_memory_id]) {
      const existing = clusterMemberships.get(memId) ?? [];
      existing.push({
        strength: rel.strength ?? 0.5,
        confidence: rel.confidence ?? 0.5,
      });
      clusterMemberships.set(memId, existing);
    }
  }

  // 5d-5f. Compute sub-scores and composite for each memory
  for (const memory of memories) {
    try {
      const memoryProps: MemoryWithProperties = {
        id: memory.uuid,
        collection_id: deps.collectionId,
        created_at: memory.properties.created_at ?? new Date().toISOString(),
        rating_bayesian: memory.properties.rating_bayesian,
        editorial_score: memory.properties.editorial_score,
        click_count: memory.properties.click_count,
        share_count: memory.properties.share_count,
        comment_count: memory.properties.comment_count,
      };

      const subScores = computeSubScoresForMemory(
        memoryProps,
        pageRankScores,
        clusterMemberships,
      );

      // 5f. Write curated_score to Weaviate
      await deps.collection.data.update({
        id: memory.uuid,
        properties: {
          curated_score: subScores.composite,
          editorial_score: memory.properties.editorial_score ?? 0,
        },
      });

      // 5g. Store sub-scores in Firestore
      await storeCuratedSubScores(subScores);

      result.memories_scored++;
    } catch (err) {
      result.skipped++;
      deps.logger?.warn?.('Curation scoring failed for memory', {
        memoryId: memory.uuid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  deps.logger?.info?.('Curation step complete', {
    memories_scored: result.memories_scored,
    editorial_evaluations: result.editorial_evaluations,
    skipped: result.skipped,
  });

  return result;
}
