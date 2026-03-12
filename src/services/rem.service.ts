/**
 * RemService — orchestrates a single REM cycle.
 *
 * Wires together collection enumeration, memory selection, clustering,
 * Haiku validation, relationship CRUD, and state persistence.
 * Cloud Run handler is a thin wrapper that creates this service and calls runCycle().
 */

import { Filters } from 'weaviate-client';
import type { WeaviateClient } from 'weaviate-client';
import type { Logger } from '../utils/logger.js';
import type { RelationshipService } from './relationship.service.js';
import type { RemConfig } from './rem.types.js';
import { DEFAULT_REM_CONFIG } from './rem.types.js';
import type { RemStateStore } from './rem.state.js';
import type { HaikuClient, HaikuValidationInput } from './rem.haiku.js';

import {
  selectCandidates,
  formClusters,
  resolveClusterActions,
  shouldSplit,
  splitCluster,
  type Cluster,
  type ClusterAction,
} from './rem.clustering.js';
import type { EmotionalScoringService } from './emotional-scoring.service.js';
import type { ScoringContextService } from './scoring-context.service.js';
import { createCollectionStatsCache } from './scoring-context.service.js';
import { computeAllComposites } from './composite-scoring.js';
import { buildRemMetadataUpdate } from './rem-metadata.js';
import { runPruningPhase, type PruningResult } from './rem.pruning.js';
import { runReconciliationPhase, type ReconciliationResult } from './rem.reconciliation.js';
import type { SubLlmProvider } from './emotional-scoring.service.js';
import type { MoodService } from './mood.service.js';
import { runMoodUpdate, buildThresholdMemoryContent, type MoodUpdateResult } from './mood-update.service.js';
import { synthesizePressuresFromDimensions } from './mood-pressure-synthesis.js';
import type { ClassificationService } from './classification.service.js';
import { runClassificationPipeline, type ClassificationPipelineResult } from './rem.classification.js';
import { runAbstractionPhase, type AbstractionPhaseResult } from './rem.abstraction.js';
import { syncMoodToMemory } from './mood-sync.service.js';
import type { EditorialScoringService } from './editorial-scoring.service.js';
import { runCurationStep, type CurationStepResult } from './curation-step.service.js';
import { getRemConfigPath } from '../database/firestore/paths.js';
import { getDocument } from '../database/firestore/init.js';
import { ensureCollection } from '../database/weaviate/v2-collections.js';

// ─── Types ───────────────────────────────────────────────────────────────

export interface RemServiceDeps {
  weaviateClient: WeaviateClient;
  relationshipServiceFactory: (collection: any, userId: string) => RelationshipService;
  stateStore: RemStateStore;
  haikuClient: HaikuClient;
  config?: Partial<RemConfig>;
  logger?: Logger;
  // Phase 0: Emotional scoring (optional — Phase 0 skipped if not provided)
  emotionalScoringService?: EmotionalScoringService;
  scoringContextService?: ScoringContextService;
  // Phase 5: Reconciliation (optional — Phase 5 skipped if not provided)
  subLlm?: SubLlmProvider;
  // Mood update (optional — mood drift skipped if not provided)
  moodService?: MoodService;
  ghostCompositeId?: string;
  // Classification (optional — classification skipped if not provided)
  classificationService?: ClassificationService;
  // Curation scoring (optional — curation step skipped if not provided)
  editorialScoringService?: EditorialScoringService;
}

export interface Phase0Stats {
  memories_scored: number;
  memories_skipped: number;
  cost_consumed: number;
  stopped_by_cost_cap: boolean;
  pressures_created: number;
}

export interface RunCycleResult {
  collection_id: string | null;
  memories_scanned: number;
  clusters_found: number;
  relationships_created: number;
  relationships_merged: number;
  relationships_split: number;
  skipped_by_haiku: number;
  abstractions_created: number;
  duration_ms: number;
  phase0?: Phase0Stats;
  pruning?: PruningResult;
  reconciliation?: ReconciliationResult;
  mood_update?: MoodUpdateResult;
  classification?: ClassificationPipelineResult;
  curation?: CurationStepResult;
}

// ─── Service ─────────────────────────────────────────────────────────────

export class RemService {
  private config: RemConfig;
  private logger: Logger;

  constructor(private deps: RemServiceDeps) {
    this.config = { ...DEFAULT_REM_CONFIG, ...deps.config };
    this.logger = deps.logger ?? { info() {}, warn() {}, error() {}, debug() {} } as any;
  }

  async runCycle(options: { collectionId: string }): Promise<RunCycleResult> {
    const start = Date.now();
    const collectionId = options.collectionId;

    // Load runtime config overrides from Firestore
    try {
      const { collectionPath, docId } = getRemConfigPath();
      const remConfigDoc = await getDocument(collectionPath, docId);
      if (remConfigDoc) {
        this.config = { ...this.config, ...remConfigDoc };
        this.logger.info?.('REM config loaded from Firestore', { overrides: Object.keys(remConfigDoc) });
      }
    } catch (err) {
      this.logger.warn?.('Failed to load REM config from Firestore, using defaults', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    const stats: RunCycleResult = {
      collection_id: collectionId,
      memories_scanned: 0,
      clusters_found: 0,
      relationships_created: 0,
      relationships_merged: 0,
      relationships_split: 0,
      skipped_by_haiku: 0,
      abstractions_created: 0,
      duration_ms: 0,
    };

    this.logger.info?.('REM cycle starting', { collectionId });

    // 3. Get collection handle + reconcile missing properties
    const collection = this.deps.weaviateClient.collections.get(collectionId);
    try {
      await ensureCollection(this.deps.weaviateClient, collectionId);
    } catch (err) {
      this.logger.warn?.('Collection reconciliation failed, continuing', {
        collectionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 4. Check collection size
    const aggregate = await collection.aggregate.overAll();
    const objectCount = aggregate.totalCount ?? 0;
    if (objectCount < this.config.min_collection_size) {
      this.logger.info?.('Collection below min size, skipping', { collectionId, objectCount });
      stats.duration_ms = Date.now() - start;
      return stats;
    }

    this.logger.info?.('Collection ready for processing', {
      collectionId,
      total_memories: objectCount,
      min_size: this.config.min_collection_size,
    });

    // 4.5. Phase 0: Emotional scoring (before relationship discovery)
    if (this.deps.emotionalScoringService && this.deps.scoringContextService) {
      try {
        const phase0Stats = await this.runPhase0Scoring(collection, collectionId);
        stats.phase0 = phase0Stats;
      } catch (err) {
        this.logger.warn?.('Phase 0 scoring failed, continuing with relationship discovery', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 4.6. Classification: classify unclassified memories via Haiku
    this.logger.info?.('Phase 1: Starting classification', { collectionId });
    if (this.deps.classificationService && this.deps.subLlm) {
      try {
        const classResult = await runClassificationPipeline({
          collection,
          collectionId,
          subLlm: this.deps.subLlm,
          classificationService: this.deps.classificationService,
          moodService: this.deps.moodService,
          ghostCompositeId: this.deps.ghostCompositeId,
          logger: this.logger,
          classificationBatchSize: this.config.classification_batch_size,
        });
        stats.classification = classResult;
      } catch (err) {
        this.logger.warn?.('Classification failed, continuing', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 4.7. Mood update: drift dimensions, decay pressures, check thresholds
    this.logger.info?.('Phase 2: Starting mood update', { collectionId });
    if (this.deps.moodService && this.deps.ghostCompositeId) {
      try {
        const userId = this.extractUserId(collectionId);
        const moodResult = await this.runMoodUpdate(userId, collection);
        if (moodResult) {
          stats.mood_update = moodResult;
        }
      } catch (err) {
        this.logger.warn?.('Mood update failed, continuing', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.info?.('Phase 3: Starting relationship discovery', { collectionId });

    // 5. Load collection state for memory cursor
    const collectionState = await this.deps.stateStore.getCollectionState(collectionId);
    const memoryCursor = collectionState?.memory_cursor ?? '';

    // 6. Select candidates using multi-strategy approach
    this.logger.info?.('Selecting candidates', { collectionId, memoryCursor: memoryCursor || '(none)' });
    const candidates = await selectCandidates(
      collection,
      memoryCursor,
      this.config.max_candidates_per_run,
      this.config,
      this.deps.haikuClient,
      this.logger,
    );
    stats.memories_scanned = candidates.length;
    this.logger.info?.('Candidates selected', { count: candidates.length });

    if (candidates.length === 0) {
      await this.advanceCursor(collectionId, memoryCursor);
      stats.duration_ms = Date.now() - start;
      return stats;
    }

    // 7. Form clusters
    this.logger.info?.('Forming clusters', { candidateCount: candidates.length });
    let clusters: Cluster[];
    try {
      clusters = await formClusters(collection, candidates, this.config, this.logger);
    } catch (err) {
      this.logger.warn?.('Cluster formation failed, skipping relationship discovery', {
        error: err instanceof Error ? err.message : String(err),
      });
      await this.advanceCursor(collectionId, memoryCursor);
      stats.duration_ms = Date.now() - start;
      return stats;
    }
    stats.clusters_found = clusters.length;
    this.logger.info?.('Clusters formed', { count: clusters.length });

    if (clusters.length === 0) {
      await this.advanceCursor(collectionId, memoryCursor);
      stats.duration_ms = Date.now() - start;
      return stats;
    }

    // 8. Extract userId from collection name for RelationshipService
    const userId = this.extractUserId(collectionId);
    const relationshipService = this.deps.relationshipServiceFactory(collection, userId);

    // 9. Resolve actions (create vs merge)
    let actions: ClusterAction[];
    try {
      actions = await resolveClusterActions(clusters, relationshipService, this.config);
    } catch (err) {
      this.logger.warn?.('Resolve cluster actions failed, skipping relationship creation', {
        error: err instanceof Error ? err.message : String(err),
      });
      await this.advanceCursor(collectionId, memoryCursor);
      stats.duration_ms = Date.now() - start;
      return stats;
    }

    // 10. Execute actions
    for (const action of actions) {
      try {
        if (action.type === 'create') {
          // Log which memories are being evaluated
          const memoryTitles = action.cluster.memories.map(m => ({
            id: m.id.slice(-8),
            title: this.extractTitle(m.content),
          }));

          this.logger.info?.('Evaluating cluster with Haiku', {
            cluster_size: action.cluster.memory_ids.length,
            avg_similarity: action.cluster.avg_similarity.toFixed(3),
            memories: memoryTitles,
          });

          const validated = await this.validateWithHaiku(action.cluster);
          if (!validated) {
            stats.skipped_by_haiku++;
            continue;
          }

          // Check if Haiku returned sub-clusters instead of validating the full cluster
          if (!validated.valid && validated.sub_clusters && validated.sub_clusters.length > 0) {
            this.logger.info?.('Cluster rejected but sub-clusters identified', {
              original_size: action.cluster.memory_ids.length,
              sub_cluster_count: validated.sub_clusters.length,
              reason: validated.reason,
            });

            // Create relationships for each sub-cluster
            for (const subCluster of validated.sub_clusters) {
              if (subCluster.memory_ids.length < 2) continue;

              this.logger.info?.('Creating relationship from sub-cluster', {
                size: subCluster.memory_ids.length,
                relationship_type: subCluster.relationship_type,
                observation: subCluster.observation,
              });

              await relationshipService.create({
                memory_ids: subCluster.memory_ids,
                relationship_type: subCluster.relationship_type,
                observation: subCluster.observation,
                strength: subCluster.strength,
                confidence: subCluster.confidence,
                tags: subCluster.tags,
                source: 'rem',
              });
              stats.relationships_created++;
            }
            continue;
          }

          this.logger.info?.('Cluster validated by Haiku', {
            cluster_size: action.cluster.memory_ids.length,
            relationship_type: validated.relationship_type,
            observation: validated.observation,
            confidence: validated.confidence,
            strength: validated.strength,
            tags: validated.tags,
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

    // 10.5. Phase 3: Abstraction (episodic to semantic promotion)
    if (this.deps.subLlm && clusters.length > 0) {
      try {
        // Query existing abstraction source IDs to avoid re-abstracting
        const existingAbstractionSourceIds = await this.getExistingAbstractionSourceIds(collection);

        const { results: abstractionResults, stats: abstractionStats } = await runAbstractionPhase(
          clusters,
          existingAbstractionSourceIds,
          { subLlm: this.deps.subLlm, logger: this.logger },
        );

        // Create memories and relationships for each abstraction
        for (const { synthesis, candidate } of abstractionResults) {
          try {
            const insertResult = await collection.data.insert({
              properties: {
                content: synthesis.content,
                observation: synthesis.observation,
                content_type: 'rem',
                doc_type: 'memory',
                tags: ['rem-abstraction', synthesis.abstraction_type],
                source: 'rem',
                trust_score: 5,
                weight: 0.8,
                created_at: new Date().toISOString(),
                user_id: userId,
                rem_touched_at: new Date().toISOString(),
                rem_visits: 1,
              },
            });

            // Create abstraction relationship
            if (insertResult) {
              await relationshipService.create({
                memory_ids: [insertResult as string, ...candidate.source_memory_ids],
                relationship_type: 'abstraction',
                observation: `Semantic abstraction of ${candidate.source_memory_ids.length} episodic memories`,
                source: 'rem',
              });
            }
          } catch (err) {
            this.logger.warn?.('Failed to create abstraction memory', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        stats.abstractions_created = abstractionStats.abstractions_created;
      } catch (err) {
        this.logger.warn?.('Phase 3 abstraction failed, continuing', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 11. Phase 4: Pruning (decay + soft-delete)
    try {
      const pruningResult = await runPruningPhase(collection, {}, this.logger);
      stats.pruning = pruningResult;
    } catch (err) {
      this.logger.warn?.('Phase 4 pruning failed, continuing', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 12. Phase 5: Reconciliation (coherence tension)
    if (this.deps.subLlm) {
      try {
        const reconciliationResult = await runReconciliationPhase(
          collection,
          { subLlm: this.deps.subLlm, logger: this.logger },
        );
        stats.reconciliation = reconciliationResult;
      } catch (err) {
        this.logger.warn?.('Phase 5 reconciliation failed, continuing', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 12.5. Phase 6: Curation scoring (curated_score computation)
    if (this.deps.editorialScoringService) {
      try {
        // Fetch all memories in collection for curation scoring
        const allMemories = await this.selectMemoriesForCuration(collection);
        // Get all relationships for PageRank
        const allRelationships = await this.getCollectionRelationships(collection, userId);

        const curationResult = await runCurationStep(
          {
            editorialService: this.deps.editorialScoringService,
            collection,
            collectionId,
            logger: this.logger,
          },
          allMemories,
          allRelationships,
        );
        stats.curation = curationResult;
      } catch (err) {
        this.logger.warn?.('Curation scoring failed, continuing', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 13. Advance cursor
    const newCursor = candidates[candidates.length - 1]?.created_at ?? memoryCursor;
    await this.advanceCursor(collectionId, newCursor);

    stats.duration_ms = Date.now() - start;
    this.logger.info?.('REM cycle complete', {
      ...stats,
      duration_seconds: Math.round(stats.duration_ms / 1000),
    });
    return stats;
  }

  /**
   * Phase 0: Score unscored/outdated memories on all 31 emotional dimensions.
   * Runs before relationship discovery to ensure emotional data is available.
   */
  private async runPhase0Scoring(
    collection: any,
    collectionId: string,
  ): Promise<Phase0Stats> {
    const stats: Phase0Stats = {
      memories_scored: 0,
      memories_skipped: 0,
      cost_consumed: 0,
      stopped_by_cost_cap: false,
      pressures_created: 0,
    };

    const scoringService = this.deps.emotionalScoringService!;
    const contextService = this.deps.scoringContextService!;

    // Invalidate stats cache at start of each cycle
    const statsCache = createCollectionStatsCache();

    this.logger.info?.('Phase 0: Starting emotional scoring', {
      collectionId,
      batch_size: this.config.scoring_batch_size,
      cost_cap: this.config.scoring_cost_cap,
    });

    // Select memories to score: unscored first (rem_touched_at is null), then outdated
    const memories = await this.selectMemoriesForScoring(collection);

    if (memories.length === 0) {
      this.logger.info?.('Phase 0: No memories to score');
      return stats;
    }

    this.logger.info?.('Phase 0: Selected memories for scoring', {
      count: memories.length,
      collectionId,
    });

    // Process batch
    for (const memory of memories) {
      // Check cost cap before scoring
      if (stats.cost_consumed + this.config.scoring_cost_per_memory > this.config.scoring_cost_cap) {
        stats.stopped_by_cost_cap = true;
        this.logger.info?.('Phase 0: Cost cap reached', {
          cost_consumed: stats.cost_consumed,
          cost_cap: this.config.scoring_cost_cap,
          memories_scored: stats.memories_scored,
        });
        break;
      }

      try {
        // 1. Gather scoring context
        const context = await contextService.gatherScoringContext(
          collection, collectionId, memory.uuid, statsCache,
        );

        // 2. Score all 31 dimensions
        const scores = await scoringService.scoreAllDimensions(
          {
            content: memory.properties.content ?? '',
            content_type: memory.properties.content_type ?? 'text',
            created_at: memory.properties.created_at ?? new Date().toISOString(),
          },
          context,
        );

        // 3. Compute composite scores
        const composites = computeAllComposites(scores);

        // 4. Build REM metadata update
        const remMeta = buildRemMetadataUpdate(
          memory.properties.rem_visits ?? 0,
        );

        // 5. Persist all scores + composites + metadata in single update
        const updateProps: Record<string, any> = {};

        for (const [dim, score] of Object.entries(scores)) {
          if (score !== null) {
            updateProps[dim] = score;
          }
        }

        if (composites.feel_significance !== null) {
          updateProps.feel_significance = composites.feel_significance;
        }
        if (composites.functional_significance !== null) {
          updateProps.functional_significance = composites.functional_significance;
        }
        if (composites.total_significance !== null) {
          updateProps.total_significance = composites.total_significance;
        }

        updateProps.rem_touched_at = remMeta.rem_touched_at;
        updateProps.rem_visits = remMeta.rem_visits;

        await collection.data.update({ id: memory.uuid, properties: updateProps });

        // 6. Synthesize mood pressures from scored dimensions
        if (this.deps.moodService && this.deps.ghostCompositeId) {
          const pressures = synthesizePressuresFromDimensions(memory.uuid, scores);
          if (pressures.length > 0) {
            const userId = this.extractUserId(collectionId);
            for (const pressure of pressures) {
              await this.deps.moodService.addPressure(userId, this.deps.ghostCompositeId, pressure);
            }
            stats.pressures_created += pressures.length;
          }
        }

        stats.memories_scored++;
        stats.cost_consumed += this.config.scoring_cost_per_memory;
      } catch (err) {
        stats.memories_skipped++;
        this.logger.warn?.('Phase 0: Failed to score memory', {
          memoryId: memory.uuid,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    this.logger.info?.('Phase 0: Emotional scoring complete', {
      ...stats,
    });

    return stats;
  }

  /**
   * Select memories for Phase 0 scoring, prioritizing:
   * 1. Unscored (rem_touched_at is null) — chronological order
   * 2. Outdated (rem_touched_at oldest) — ascending order
   */
  private async selectMemoriesForScoring(collection: any): Promise<any[]> {
    const batchSize = this.config.scoring_batch_size;

    // First: unscored memories (rem_touched_at is null)
    const unscoredFilter = Filters.and(
      collection.filter.byProperty('doc_type').equal('memory'),
      collection.filter.byProperty('rem_touched_at').isNull(true),
    );

    const unscoredResult = await collection.query.fetchObjects({
      filters: unscoredFilter,
      limit: batchSize,
      sort: collection.sort.byProperty('created_at', true),
    });

    const unscored = unscoredResult.objects;

    // Only score unscored memories — already-scored memories are not revisited
    return unscored.slice(0, batchSize);
  }

  private async validateWithHaiku(
    cluster: { memories: Array<{ id: string; content: string; tags: string[] }> },
  ) {
    try {
      // Deduplicate memories by content before validation
      const seen = new Set<string>();
      const uniqueMemories = cluster.memories.filter((m) => {
        const key = m.content.slice(0, 200); // Use first 200 chars as dedup key
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Skip if only duplicates remain
      if (uniqueMemories.length < 2) {
        this.logger.info?.('Cluster rejected: only duplicates', {
          cluster_size: cluster.memories.length,
          unique_count: uniqueMemories.length,
        });
        return null;
      }

      const input: HaikuValidationInput = {
        memories: uniqueMemories.map((m) => ({
          id: m.id,
          content: m.content,
          tags: m.tags,
        })),
      };

      // Use confidence-based evaluation
      const evalResult = await this.deps.haikuClient.evaluateCluster(input);
      const threshold = this.config.cluster_confidence_threshold;

      this.logger.info?.('Cluster evaluation result', {
        confidence: evalResult.confidence,
        threshold,
        reasoning: evalResult.reasoning,
        has_sub_clusters: !!(evalResult.sub_clusters?.length),
      });

      // If confidence meets threshold, convert to a valid HaikuValidationResult
      if (evalResult.confidence >= threshold) {
        return {
          valid: true,
          relationship_type: evalResult.relationship_type,
          observation: evalResult.observation,
          strength: evalResult.strength,
          confidence: evalResult.confidence,
          tags: evalResult.tags,
        };
      }

      // Below threshold — check for sub-clusters that individually meet threshold
      if (evalResult.sub_clusters?.length) {
        const validSubClusters = evalResult.sub_clusters.filter(
          (sc) => sc.confidence >= threshold && sc.memory_ids.length >= 2,
        );

        if (validSubClusters.length > 0) {
          return {
            valid: false,
            reason: evalResult.reasoning,
            sub_clusters: validSubClusters,
          };
        }
      }

      this.logger.info?.('Cluster rejected: below confidence threshold', {
        cluster_size: cluster.memories.length,
        unique_count: uniqueMemories.length,
        confidence: evalResult.confidence,
        threshold,
        reasoning: evalResult.reasoning,
      });
      return null;
    } catch (err) {
      this.logger.warn?.('Haiku validation error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Run mood update: drift dimensions toward pressures, decay stale pressures,
   * detect threshold flags and create high-weight memories for sustained extreme states.
   */
  private async runMoodUpdate(userId: string, collection: any): Promise<MoodUpdateResult | null> {
    const moodService = this.deps.moodService!;
    const ghostCompositeId = this.deps.ghostCompositeId!;

    const mood = await moodService.getOrInitialize(userId, ghostCompositeId);

    const result = runMoodUpdate(mood);

    // Persist updated mood state + decayed pressures
    await moodService.updateMood(userId, ghostCompositeId, {
      state: result.newState,
      rem_cycles_since_shift: result.remCyclesSinceShift,
    });
    await moodService.setPressures(userId, ghostCompositeId, result.decayedPressures);

    this.logger.info?.('Mood update complete', {
      significantChange: result.significantChange,
      remCyclesSinceShift: result.remCyclesSinceShift,
      thresholdFlags: result.thresholdFlags.map(f => f.name),
      pressuresRemaining: result.decayedPressures.length,
    });

    // Sync mood state to Weaviate as a searchable memory
    try {
      const updatedMood = await moodService.getOrInitialize(userId, ghostCompositeId);
      const syncResult = await syncMoodToMemory(collection, updatedMood, userId, ghostCompositeId);
      this.logger.info?.('Mood memory synced', { id: syncResult.id, action: syncResult.action });
    } catch (err) {
      this.logger.warn?.('Failed to sync mood to memory, continuing', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Create high-weight memories for threshold flags
    for (const flag of result.thresholdFlags) {
      try {
        const topPressure = mood.pressures
          .filter(p => p.dimension === flag.dimension)
          .sort((a, b) => Math.abs(b.magnitude) - Math.abs(a.magnitude))[0];

        const content = buildThresholdMemoryContent(flag, topPressure);

        await collection.data.insert({
          properties: {
            content,
            content_type: 'mood_threshold',
            doc_type: 'memory',
            weight: 0.9,
            tags: ['mood', 'threshold', flag.name],
            created_at: new Date().toISOString(),
            user_id: userId,
          },
        });

        this.logger.info?.('Threshold memory created', {
          flag: flag.name,
          dimension: flag.dimension,
          value: flag.value,
          cycles: flag.cycles,
        });
      } catch (err) {
        this.logger.warn?.('Failed to create threshold memory', {
          flag: flag.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return result;
  }

  /**
   * Query for memory IDs that are already part of an abstraction relationship.
   */
  private async getExistingAbstractionSourceIds(collection: any): Promise<Set<string>> {
    try {
      const filter = collection.filter.byProperty('content_type').equal('rem');
      const result = await collection.query.fetchObjects({
        filters: filter,
        limit: 100,
        returnProperties: ['tags'],
      });

      const sourceIds = new Set<string>();
      // We track that a cluster was abstracted by the existence of rem memories
      // The actual source IDs are in the abstraction relationships, but for efficiency
      // we just check if rem memories exist at all (the abstraction phase's
      // "already abstracted" check handles the detailed logic)
      for (const obj of result.objects ?? []) {
        sourceIds.add(obj.uuid);
      }
      return sourceIds;
    } catch {
      return new Set();
    }
  }

  /**
   * Select memories for curation scoring (all doc_type='memory' in collection).
   */
  private async selectMemoriesForCuration(collection: any): Promise<any[]> {
    const filter = collection.filter.byProperty('doc_type').equal('memory');
    const result = await collection.query.fetchObjects({
      filters: filter,
      limit: this.config.max_candidates_per_run * 2,
      returnProperties: [
        'content', 'created_at', 'rating_bayesian', 'editorial_score',
        'click_count', 'share_count', 'comment_count', 'relationship_count',
      ],
    });
    return result.objects ?? [];
  }

  /**
   * Get relationships in a collection for PageRank computation.
   */
  private async getCollectionRelationships(collection: any, userId: string): Promise<any[]> {
    try {
      const relService = this.deps.relationshipServiceFactory(collection, userId);
      const result = await relService.search({ query: '', limit: 500 });
      return (result.relationships ?? []).flatMap((r: any) => {
        const ids = r.related_memory_ids ?? [];
        const pairs: any[] = [];
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            pairs.push({
              source_memory_id: ids[i],
              target_memory_id: ids[j],
              strength: r.strength,
              confidence: r.confidence,
            });
          }
        }
        return pairs;
      });
    } catch {
      return [];
    }
  }

  private async advanceCursor(collectionId: string, memoryCursor: string) {
    const now = new Date().toISOString();
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

  private extractTitle(content: string): string {
    // Extract first line or first 60 chars as title
    const firstLine = content.split('\n')[0];
    if (firstLine.length <= 60) {
      return firstLine;
    }
    return firstLine.slice(0, 57) + '...';
  }
}
