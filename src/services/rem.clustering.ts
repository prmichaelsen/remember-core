/**
 * REM clustering algorithm.
 *
 * Core logic for memory selection, greedy agglomerative clustering,
 * deduplication against existing relationships, and merge/split decisions.
 */

import { Filters } from 'weaviate-client';
import type { RemConfig } from './rem.types.js';
import type { RelationshipService } from './relationship.service.js';
import type { Logger } from '../utils/logger.js';
import type { HaikuClient } from './rem.haiku.js';
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
 * Multi-Strategy Candidate Selection Architecture
 *
 * Combines multiple strategies to find diverse, relevant memory candidates for clustering:
 *
 * 1. **Recency-based** (1/3 of batch):
 *    - Newest memories by created_at timestamp
 *    - Ensures recent activity is processed
 *
 * 2. **Cursor-based** (1/3 of batch):
 *    - Unprocessed memories (created_at > cursor)
 *    - Ensures systematic forward progress through collection
 *
 * 3. **Random sampling** (1/3 of batch):
 *    - Random offset into collection
 *    - Provides serendipitous coverage of older memories
 *
 * 4. **LLM-enhanced semantic search** (seed_count * 4 * candidates_per_seed_strategy):
 *    - Pick N random seed memories
 *    - For each seed, use Haiku to extract:
 *      a) Keywords (specific terms, entities, concepts)
 *      b) Topics (high-level subject areas)
 *      c) Themes (abstract ideas, patterns)
 *      d) Summary (1-2 sentence distillation)
 *    - Perform nearText vector search for EACH extraction type
 *    - Finds semantically related memories across different abstraction levels
 *
 * All strategies are deduplicated and capped at max_candidates_per_run.
 */

/**
 * Select candidate memories using multi-strategy approach.
 * Deduplicates across all strategies. Filters to doc_type='memory' only.
 */
export async function selectCandidates(
  collection: any,
  memoryCursor: string,
  count: number,
  config: RemConfig,
  haikuClient: HaikuClient,
  logger?: Logger,
): Promise<MemoryCandidate[]> {
  const baseStrategyCount = Math.max(1, Math.floor(count / 6)); // Reduce base strategies to make room for LLM
  const returnProps = ['content', 'created_at', 'tags', 'doc_type'] as const;
  const memoryFilter = collection.filter.byProperty('doc_type').equal('memory');

  logger?.info?.('Starting multi-strategy candidate selection', {
    target: count,
    base_strategy_limit: baseStrategyCount,
    seed_count: config.seed_count,
    candidates_per_seed_strategy: config.candidates_per_seed_strategy,
  });

  const seen = new Set<string>();
  const candidates: MemoryCandidate[] = [];

  function addCandidate(obj: any) {
    const id = obj.uuid ?? obj.id;
    if (seen.has(id)) return;
    if (obj.properties.doc_type !== 'memory') return;
    seen.add(id);
    candidates.push({
      id,
      content: obj.properties.content ?? '',
      created_at: obj.properties.created_at ?? '',
      tags: obj.properties.tags ?? [],
    });
  }

  // Strategy 1: Newest memories
  logger?.info?.('Strategy: newest', { limit: baseStrategyCount });
  const newestResult = await collection.query.fetchObjects({
    filters: memoryFilter,
    sort: collection.sort.byProperty('created_at', false),
    limit: baseStrategyCount,
    returnProperties: returnProps,
  });
  for (const obj of newestResult.objects ?? []) addCandidate(obj);
  logger?.info?.('Strategy: newest complete', { found: newestResult.objects?.length ?? 0 });

  // Strategy 2: Unprocessed (created_at > cursor)
  logger?.info?.('Strategy: unprocessed', { cursor: memoryCursor || '(none)', limit: baseStrategyCount });
  if (memoryCursor) {
    const unprocessedFilter = Filters.and(
      collection.filter.byProperty('doc_type').equal('memory'),
      collection.filter.byProperty('created_at').greaterThan(memoryCursor),
    );
    const unprocessedResult = await collection.query.fetchObjects({
      filters: unprocessedFilter,
      limit: baseStrategyCount,
      returnProperties: returnProps,
    });
    for (const obj of unprocessedResult.objects ?? []) addCandidate(obj);
    logger?.info?.('Strategy: unprocessed complete', { found: unprocessedResult.objects?.length ?? 0 });
  } else {
    logger?.info?.('Strategy: unprocessed skipped (no cursor)');
  }

  // Strategy 3: Random sampling
  const randomOffset = Math.floor(Math.random() * 50);
  logger?.info?.('Strategy: random', { limit: baseStrategyCount, offset: randomOffset });
  const randomResult = await collection.query.fetchObjects({
    filters: memoryFilter,
    limit: baseStrategyCount,
    offset: randomOffset,
    returnProperties: returnProps,
  });
  for (const obj of randomResult.objects ?? []) addCandidate(obj);
  logger?.info?.('Strategy: random complete', { found: randomResult.objects?.length ?? 0 });

  // Strategy 4: LLM-enhanced semantic search
  logger?.info?.('Strategy: LLM-enhanced semantic search', { seeds: config.seed_count });

  // Pick random seeds for LLM extraction
  const seedOffset = Math.floor(Math.random() * 100);
  const seedsResult = await collection.query.fetchObjects({
    filters: memoryFilter,
    limit: config.seed_count,
    offset: seedOffset,
    returnProperties: returnProps,
  });

  let seedsSkipped = 0;
  for (let i = 0; i < (seedsResult.objects ?? []).length; i++) {
    const seed = seedsResult.objects[i];
    const seedId = seed.uuid ?? seed.id;
    const seedContent = seed.properties.content ?? '';

    logger?.info?.(`Strategy: LLM seed ${i + 1}/${config.seed_count}`, { seed_id: seedId });

    try {
      // Extract features using Haiku
      const extraction = await haikuClient.extractFeatures(seedContent);

      // nearText search for keywords
      if (extraction.keywords.length > 0) {
        const keywordQuery = extraction.keywords.slice(0, 5).join(' '); // Top 5 keywords
        const keywordResult = await collection.query.nearText(keywordQuery, {
          limit: config.candidates_per_seed_strategy,
          filters: memoryFilter,
        });
        for (const obj of keywordResult.objects ?? []) addCandidate(obj);
        logger?.debug?.(`  nearText(keywords): ${keywordResult.objects?.length ?? 0} results`);
      }

      // nearText search for topics
      if (extraction.topics.length > 0) {
        const topicQuery = extraction.topics.join(' ');
        const topicResult = await collection.query.nearText(topicQuery, {
          limit: config.candidates_per_seed_strategy,
          filters: memoryFilter,
        });
        for (const obj of topicResult.objects ?? []) addCandidate(obj);
        logger?.debug?.(`  nearText(topics): ${topicResult.objects?.length ?? 0} results`);
      }

      // nearText search for themes
      if (extraction.themes.length > 0) {
        const themeQuery = extraction.themes.join(' ');
        const themeResult = await collection.query.nearText(themeQuery, {
          limit: config.candidates_per_seed_strategy,
          filters: memoryFilter,
        });
        for (const obj of themeResult.objects ?? []) addCandidate(obj);
        logger?.debug?.(`  nearText(themes): ${themeResult.objects?.length ?? 0} results`);
      }

      // nearText search for summary
      if (extraction.summary) {
        const summaryResult = await collection.query.nearText(extraction.summary, {
          limit: config.candidates_per_seed_strategy,
          filters: memoryFilter,
        });
        for (const obj of summaryResult.objects ?? []) addCandidate(obj);
        logger?.debug?.(`  nearText(summary): ${summaryResult.objects?.length ?? 0} results`);
      }
    } catch (err) {
      seedsSkipped++;
      logger?.warn?.(`Strategy: LLM seed ${i + 1}/${config.seed_count} failed, skipping`, { seed_id: seedId, error: String(err) });
    }
  }
  if (seedsSkipped > 0) {
    logger?.info?.(`LLM seed strategy: ${seedsSkipped}/${(seedsResult.objects ?? []).length} seeds skipped due to errors`);
  }

  const final = candidates.slice(0, count);
  logger?.info?.('Multi-strategy candidate selection complete', {
    requested: count,
    selected: final.length,
    unique_candidates: candidates.length,
    strategies: {
      newest: baseStrategyCount,
      unprocessed: memoryCursor ? baseStrategyCount : 0,
      random: baseStrategyCount,
      llm_seeds: config.seed_count,
      llm_queries_per_seed: 4,
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
