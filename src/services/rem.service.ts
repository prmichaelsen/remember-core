/**
 * RemService — orchestrates a single REM cycle.
 *
 * Wires together collection enumeration, memory selection, clustering,
 * Haiku validation, relationship CRUD, and state persistence.
 * Cloud Run handler is a thin wrapper that creates this service and calls runCycle().
 */

import type { WeaviateClient } from 'weaviate-client';
import type { Logger } from '../utils/logger.js';
import type { RelationshipService } from './relationship.service.js';
import type { RemConfig } from './rem.types.js';
import { DEFAULT_REM_CONFIG } from './rem.types.js';
import type { RemStateStore } from './rem.state.js';
import type { HaikuClient, HaikuValidationInput } from './rem.haiku.js';
import { getNextMemoryCollection } from './rem.collections.js';
import {
  selectCandidates,
  formClusters,
  resolveClusterActions,
  shouldSplit,
  splitCluster,
} from './rem.clustering.js';

// ─── Types ───────────────────────────────────────────────────────────────

export interface RemServiceDeps {
  weaviateClient: WeaviateClient;
  relationshipServiceFactory: (collection: any, userId: string) => RelationshipService;
  stateStore: RemStateStore;
  haikuClient: HaikuClient;
  config?: Partial<RemConfig>;
  logger?: Logger;
}

export interface RunCycleResult {
  collection_id: string | null;
  memories_scanned: number;
  clusters_found: number;
  relationships_created: number;
  relationships_merged: number;
  relationships_split: number;
  skipped_by_haiku: number;
  duration_ms: number;
}

// ─── Service ─────────────────────────────────────────────────────────────

export class RemService {
  private config: RemConfig;
  private logger: Logger;

  constructor(private deps: RemServiceDeps) {
    this.config = { ...DEFAULT_REM_CONFIG, ...deps.config };
    this.logger = deps.logger ?? { info() {}, warn() {}, error() {}, debug() {} } as any;
  }

  async runCycle(): Promise<RunCycleResult> {
    const start = Date.now();
    const stats = {
      collection_id: null as string | null,
      memories_scanned: 0,
      clusters_found: 0,
      relationships_created: 0,
      relationships_merged: 0,
      relationships_split: 0,
      skipped_by_haiku: 0,
      duration_ms: 0,
    };

    // 1. Pick next collection via cursor
    const cursor = await this.deps.stateStore.getCursor();
    this.logger.info?.('REM cursor loaded', {
      last_collection_id: cursor?.last_collection_id ?? '(none)',
      last_run_at: cursor?.last_run_at ?? '(never)',
    });

    const collectionId = await getNextMemoryCollection(cursor?.last_collection_id ?? null);
    if (!collectionId) {
      this.logger.info?.('No collections to process');
      stats.duration_ms = Date.now() - start;
      return stats;
    }
    stats.collection_id = collectionId;
    this.logger.info?.('REM cycle starting', {
      collectionId,
      advanced_from: cursor?.last_collection_id ?? '(first run)',
      is_same_collection: cursor?.last_collection_id === collectionId,
      wrap_around: cursor?.last_collection_id && cursor.last_collection_id >= collectionId,
    });

    // 3. Get collection handle
    const collection = this.deps.weaviateClient.collections.get(collectionId);

    // 4. Check collection size
    const aggregate = await collection.aggregate.overAll();
    const objectCount = aggregate.totalCount ?? 0;
    if (objectCount < this.config.min_collection_size) {
      this.logger.info?.('Collection below min size, skipping', { collectionId, objectCount });
      await this.deps.stateStore.saveCursor({
        last_collection_id: collectionId,
        last_run_at: new Date().toISOString(),
      });
      stats.duration_ms = Date.now() - start;
      return stats;
    }

    this.logger.info?.('Collection ready for processing', {
      collectionId,
      total_memories: objectCount,
      min_size: this.config.min_collection_size,
    });

    // 5. Load collection state for memory cursor
    const collectionState = await this.deps.stateStore.getCollectionState(collectionId);
    const memoryCursor = collectionState?.memory_cursor ?? '';

    // 6. Select candidates
    const candidates = await selectCandidates(
      collection,
      memoryCursor,
      this.config.max_candidates_per_run,
      this.logger,
    );
    stats.memories_scanned = candidates.length;

    if (candidates.length === 0) {
      await this.advanceCursor(collectionId, memoryCursor);
      stats.duration_ms = Date.now() - start;
      return stats;
    }

    // 7. Form clusters
    const clusters = await formClusters(collection, candidates, this.config, this.logger);
    stats.clusters_found = clusters.length;

    if (clusters.length === 0) {
      await this.advanceCursor(collectionId, memoryCursor);
      stats.duration_ms = Date.now() - start;
      return stats;
    }

    // 8. Extract userId from collection name for RelationshipService
    const userId = this.extractUserId(collectionId);
    const relationshipService = this.deps.relationshipServiceFactory(collection, userId);

    // 9. Resolve actions (create vs merge)
    const actions = await resolveClusterActions(clusters, relationshipService, this.config);

    // 10. Execute actions
    for (const action of actions) {
      try {
        if (action.type === 'create') {
          const validated = await this.validateWithHaiku(action.cluster);
          if (!validated) {
            this.logger.debug?.('Cluster rejected by Haiku', {
              cluster_size: action.cluster.memory_ids.length,
            });
            stats.skipped_by_haiku++;
            continue;
          }

          this.logger.debug?.('Cluster validated by Haiku', {
            cluster_size: action.cluster.memory_ids.length,
            relationship_type: validated.relationship_type,
            observation: validated.observation,
          });

          await relationshipService.create({
            memory_ids: action.cluster.memory_ids,
            relationship_type: validated.relationship_type ?? 'topical',
            observation: validated.observation ?? 'REM auto-discovered relationship',
            strength: validated.strength ?? 0.5,
            confidence: validated.confidence ?? 0.7,
            tags: validated.tags ?? [],
            source: 'rem',
          });
          stats.relationships_created++;

        } else if (action.type === 'merge' && action.existing_relationship_id && action.new_memory_ids?.length) {
          // For merge: update the existing relationship to include new memory IDs
          // Fetch existing, add new IDs, check split
          const existing = await relationshipService.findByMemoryIds({
            memory_ids: [action.existing_relationship_id],
          });
          const existingRel = existing.relationships.find(
            (r) => r.id === action.existing_relationship_id,
          );
          const currentIds = (existingRel?.related_memory_ids as string[]) ?? [];
          const mergedIds = [...new Set([...currentIds, ...action.new_memory_ids])];

          if (shouldSplit(mergedIds, this.config)) {
            // Split: create sub-relationships from the merged set
            const subClusters = splitCluster(
              { ...action.cluster, memory_ids: mergedIds, memories: action.cluster.memories },
              this.config,
            );
            for (const sub of subClusters) {
              await relationshipService.create({
                memory_ids: sub.memory_ids,
                relationship_type: 'topical',
                observation: 'REM split relationship',
                source: 'rem',
              });
            }
            stats.relationships_split += subClusters.length;
          } else {
            await relationshipService.update({
              relationship_id: action.existing_relationship_id,
              observation: existingRel?.observation as string ?? 'REM merged relationship',
            });
            stats.relationships_merged++;
          }
        }
      } catch (err) {
        this.logger.warn?.('Error processing cluster action', {
          type: action.type,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 11. Advance cursor
    const newCursor = candidates[candidates.length - 1]?.created_at ?? memoryCursor;
    await this.advanceCursor(collectionId, newCursor);

    stats.duration_ms = Date.now() - start;
    this.logger.info?.('REM cycle complete', {
      ...stats,
      duration_seconds: Math.round(stats.duration_ms / 1000),
    });
    return stats;
  }

  private async validateWithHaiku(
    cluster: { memories: Array<{ id: string; content: string; tags: string[] }> },
  ) {
    try {
      const input: HaikuValidationInput = {
        memories: cluster.memories.map((m) => ({
          id: m.id,
          content_summary: m.content.slice(0, 200),
          tags: m.tags,
        })),
      };
      const result = await this.deps.haikuClient.validateCluster(input);
      return result.valid ? result : null;
    } catch {
      return null;
    }
  }

  private async advanceCursor(collectionId: string, memoryCursor: string) {
    const now = new Date().toISOString();
    await this.deps.stateStore.saveCursor({
      last_collection_id: collectionId,
      last_run_at: now,
    });
    await this.deps.stateStore.saveCollectionState({
      collection_id: collectionId,
      last_processed_at: now,
      memory_cursor: memoryCursor,
    });
    this.logger.debug?.('Cursor advanced', {
      collection_id: collectionId,
      memory_cursor: memoryCursor || '(reset)',
    });
  }

  private extractUserId(collectionId: string): string {
    if (collectionId.startsWith('Memory_users_')) {
      return collectionId.replace('Memory_users_', '');
    }
    if (collectionId.startsWith('Memory_groups_')) {
      return collectionId.replace('Memory_groups_', '');
    }
    return 'system';
  }
}
