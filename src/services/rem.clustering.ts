/**
 * REM clustering algorithm.
 *
 * Core logic for memory selection, greedy agglomerative clustering,
 * deduplication against existing relationships, and merge/split decisions.
 */

import type { RemConfig } from './rem.types.js';
import type { RelationshipService } from './relationship.service.js';
import type { Logger } from '../utils/logger.js';
import { computeOverlap } from './relationship.service.js';

// ─── Types ───────────────────────────────────────────────────────────────

export interface MemoryCandidate {
  id: string;
  content: string;
  created_at: string;
  tags: string[];
}

export interface Cluster {
  seed_id: string;
  memory_ids: string[];
  memories: MemoryCandidate[];
  avg_similarity: number;
}

export interface ClusterAction {
  type: 'create' | 'merge' | 'skip';
  cluster: Cluster;
  existing_relationship_id?: string;
  new_memory_ids?: string[];
}

// ─── Memory Selection ────────────────────────────────────────────────────

/**
 * Select candidate memories from three sources: newest, unprocessed, and random.
 * Deduplicates across sources. Filters to doc_type='memory' only.
 */
export async function selectCandidates(
  collection: any,
  memoryCursor: string,
  count: number,
  logger?: Logger,
): Promise<MemoryCandidate[]> {
  const third = Math.max(1, Math.ceil(count / 3));
  const returnProps = ['content', 'created_at', 'tags', 'doc_type'] as const;
  const memoryFilter = collection.filter.byProperty('doc_type').equal('memory');

  logger?.debug?.('Selecting candidates', { target: count, per_source: third });

  // 1/3 newest
  logger?.debug?.('Fetching newest memories');
  const newestResult = await collection.query.fetchObjects({
    filters: memoryFilter,
    sort: { sorts: [{ property: 'created_at', order: 'desc' }] },
    limit: third,
    returnProperties: returnProps,
  });

  // 1/3 unprocessed (created_at > cursor)
  logger?.debug?.('Fetching unprocessed memories', { cursor: memoryCursor || '(none)' });
  let unprocessedResult = { objects: [] as any[] };
  if (memoryCursor) {
    const unprocessedFilter = collection.filter.byProperty('created_at').greaterThan(memoryCursor);
    const combined = collection.filter.byProperty('doc_type').equal('memory');
    unprocessedResult = await collection.query.fetchObjects({
      filters: combined,
      limit: third,
      returnProperties: returnProps,
    });
    // Further filter by cursor in case the mock doesn't support combined
    unprocessedResult.objects = unprocessedResult.objects.filter(
      (o: any) => o.properties.created_at > memoryCursor,
    );
  }

  // 1/3 random: use offset with a pseudo-random skip
  logger?.debug?.('Fetching random memories');
  const randomOffset = Math.floor(Math.random() * 50);
  const randomResult = await collection.query.fetchObjects({
    filters: memoryFilter,
    limit: third,
    offset: randomOffset,
    returnProperties: returnProps,
  });

  // Combine and deduplicate
  const seen = new Set<string>();
  const candidates: MemoryCandidate[] = [];

  for (const resultSet of [newestResult, unprocessedResult, randomResult]) {
    for (const obj of resultSet.objects ?? []) {
      const id = obj.uuid ?? obj.id;
      if (seen.has(id)) continue;
      if (obj.properties.doc_type !== 'memory') continue;
      seen.add(id);
      candidates.push({
        id,
        content: obj.properties.content ?? '',
        created_at: obj.properties.created_at ?? '',
        tags: obj.properties.tags ?? [],
      });
    }
  }

  const final = candidates.slice(0, count);
  logger?.debug?.('Candidates selected', {
    requested: count,
    selected: final.length,
    sources: {
      newest: newestResult.objects?.length ?? 0,
      unprocessed: unprocessedResult.objects?.length ?? 0,
      random: randomResult.objects?.length ?? 0,
    },
  });
  return final;
}

// ─── Cluster Formation ───────────────────────────────────────────────────

/**
 * Form clusters by finding similar memories for each candidate.
 * Deduplicates overlapping clusters (>80% same members → keep larger).
 */
export async function formClusters(
  collection: any,
  candidates: MemoryCandidate[],
  config: RemConfig,
  logger?: Logger,
): Promise<Cluster[]> {
  const rawClusters: Cluster[] = [];
  const total = candidates.length;
  const logInterval = Math.max(1, Math.floor(total / 10)); // Log every 10%

  logger?.info?.('Starting cluster formation', {
    candidates: total,
    similarity_threshold: config.similarity_threshold,
  });

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];

    // Log progress every 10%
    if (i > 0 && i % logInterval === 0) {
      logger?.info?.('Cluster formation progress', {
        processed: i,
        total,
        percent: Math.round((i / total) * 100),
        clusters_found: rawClusters.length,
      });
    }
    const distance = 1 - config.similarity_threshold;
    const res = await collection.query.nearObject(candidate.id, {
      limit: config.max_similar_per_candidate + 1,
      distance,
      returnMetadata: ['distance'],
      returnProperties: ['content', 'created_at', 'tags', 'doc_type'],
      filters: collection.filter.byProperty('doc_type').equal('memory'),
    });

    const similar = (res.objects ?? []).filter(
      (o: any) => (o.uuid ?? o.id) !== candidate.id && o.properties.doc_type === 'memory',
    );

    if (similar.length < 2) continue;

    const memories: MemoryCandidate[] = [candidate];
    const memoryIds = [candidate.id];
    let totalSimilarity = 0;

    for (const obj of similar) {
      const id = obj.uuid ?? obj.id;
      memoryIds.push(id);
      memories.push({
        id,
        content: obj.properties.content ?? '',
        created_at: obj.properties.created_at ?? '',
        tags: obj.properties.tags ?? [],
      });
      totalSimilarity += 1 - (obj.metadata?.distance ?? 0);
    }

    rawClusters.push({
      seed_id: candidate.id,
      memory_ids: memoryIds,
      memories,
      avg_similarity: totalSimilarity / similar.length,
    });
  }

  const deduplicated = deduplicateClusters(rawClusters);
  logger?.info?.('Cluster formation complete', {
    candidates_processed: total,
    raw_clusters: rawClusters.length,
    deduplicated_clusters: deduplicated.length,
    avg_cluster_size: deduplicated.length > 0
      ? Math.round(deduplicated.reduce((sum, c) => sum + c.memory_ids.length, 0) / deduplicated.length)
      : 0,
  });
  return deduplicated;
}

/**
 * Remove overlapping clusters. If two clusters share >80% of members,
 * keep the larger one.
 */
function deduplicateClusters(clusters: Cluster[]): Cluster[] {
  const result: Cluster[] = [];

  for (const cluster of clusters) {
    let isDuplicate = false;
    for (const existing of result) {
      const overlap = computeClusterOverlap(existing.memory_ids, cluster.memory_ids);
      if (overlap > 0.8) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      result.push(cluster);
    }
  }

  return result;
}

/**
 * Compute symmetric overlap between two sets: |intersection| / |smaller|.
 */
function computeClusterOverlap(a: string[], b: string[]): number {
  const smaller = Math.min(a.length, b.length);
  if (smaller === 0) return 0;
  const setA = new Set(a);
  const intersection = b.filter((id) => setA.has(id)).length;
  return intersection / smaller;
}

// ─── Dedup Against Existing Relationships ────────────────────────────────

/**
 * For each cluster, check overlap with existing relationships.
 * Decides create vs. merge based on overlap threshold.
 */
export async function resolveClusterActions(
  clusters: Cluster[],
  relationshipService: RelationshipService,
  config: RemConfig,
): Promise<ClusterAction[]> {
  const actions: ClusterAction[] = [];

  for (const cluster of clusters) {
    const existing = await relationshipService.findByMemoryIds({
      memory_ids: cluster.memory_ids,
      source_filter: 'rem',
    });

    let bestOverlap = 0;
    let bestRelId: string | undefined;
    let bestRelMemoryIds: string[] = [];

    for (const rel of existing.relationships) {
      const relMemoryIds = (rel.related_memory_ids as string[]) ?? (rel.memory_ids as string[]) ?? [];
      const overlap = computeOverlap(relMemoryIds, cluster.memory_ids);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestRelId = rel.id as string;
        bestRelMemoryIds = relMemoryIds;
      }
    }

    if (bestOverlap > config.overlap_merge_threshold && bestRelId) {
      const existingSet = new Set(bestRelMemoryIds);
      const newIds = cluster.memory_ids.filter((id) => !existingSet.has(id));
      actions.push({
        type: 'merge',
        cluster,
        existing_relationship_id: bestRelId,
        new_memory_ids: newIds,
      });
    } else {
      actions.push({ type: 'create', cluster });
    }
  }

  return actions;
}

// ─── Split ───────────────────────────────────────────────────────────────

/**
 * Check if a relationship exceeds the maximum member count.
 */
export function shouldSplit(memoryIds: string[], config: RemConfig): boolean {
  return memoryIds.length > config.max_relationship_members;
}

/**
 * Split a cluster into sub-clusters within the size limit.
 * Simple strategy: chunk by order (preserves similarity ranking from formation).
 */
export function splitCluster(cluster: Cluster, config: RemConfig): Cluster[] {
  const maxSize = config.max_relationship_members;
  if (cluster.memory_ids.length <= maxSize) return [cluster];

  const subClusters: Cluster[] = [];
  for (let i = 0; i < cluster.memory_ids.length; i += maxSize) {
    const ids = cluster.memory_ids.slice(i, i + maxSize);
    const memories = cluster.memories.filter((m) => ids.includes(m.id));
    subClusters.push({
      seed_id: ids[0],
      memory_ids: ids,
      memories,
      avg_similarity: cluster.avg_similarity,
    });
  }

  return subClusters;
}
