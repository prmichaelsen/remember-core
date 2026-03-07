/**
 * RemJobWorker — executes REM cycles as tracked job steps.
 *
 * Each collection gets a discrete job that runs RemService.runCycle()
 * and reports progress through JobService.
 */

import type { Logger } from '../utils/logger.js';
import type { JobService } from './job.service.js';
import type { RemService, RunCycleResult } from './rem.service.js';

// ─── Types ──────────────────────────────────────────────────────────────

export interface RemJobParams {
  collection_id: string;
}

// ─── Steps ──────────────────────────────────────────────────────────────

const REM_STEPS = [
  { id: 'candidate-selection', label: 'Selecting memory candidates' },
  { id: 'clustering', label: 'Forming clusters' },
  { id: 'haiku-validation', label: 'Validating clusters with Haiku' },
  { id: 'relationship-crud', label: 'Creating/updating relationships' },
  { id: 'abstraction', label: 'Abstracting episodic patterns to semantic memories' },
  { id: 'pruning', label: 'Pruning low-significance memories' },
  { id: 'reconciliation', label: 'Reconciling coherence tension conflicts' },
] as const;

// ─── Worker ─────────────────────────────────────────────────────────────

export class RemJobWorker {
  constructor(
    private jobService: JobService,
    private remService: RemService,
    private logger: Logger,
  ) {}

  async execute(jobId: string, params: RemJobParams): Promise<void> {
    const { collection_id } = params;

    // Register steps upfront
    for (const step of REM_STEPS) {
      await this.jobService.addStep(jobId, {
        id: step.id,
        label: step.label,
        status: 'pending',
        started_at: null,
        completed_at: null,
        error: null,
      });
    }

    // Mark first step running
    await this.jobService.updateStep(jobId, 'candidate-selection', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    await this.jobService.updateProgress(jobId, {
      progress: 0,
      current_step: 'Selecting memory candidates',
    });

    try {
      // Check cancellation before starting
      if (await this.jobService.isCancelled(jobId)) {
        await this.jobService.complete(jobId, {
          status: 'cancelled',
          result: { collection_id },
        });
        return;
      }

      // Run the full REM cycle against the job's collection
      const result: RunCycleResult = await this.remService.runCycle({ collectionId: collection_id });

      // Mark all steps completed (runCycle is monolithic)
      const now = new Date().toISOString();
      for (let i = 0; i < REM_STEPS.length; i++) {
        await this.jobService.updateStep(jobId, REM_STEPS[i].id, {
          status: 'completed',
          started_at: now,
          completed_at: now,
        });

        await this.jobService.updateProgress(jobId, {
          progress: Math.round(((i + 1) / REM_STEPS.length) * 100),
          current_step: REM_STEPS[i].label,
        });
      }

      // Complete job with result stats
      await this.jobService.complete(jobId, {
        status: 'completed',
        result: {
          collection_id: result.collection_id ?? collection_id,
          memories_scanned: result.memories_scanned,
          clusters_found: result.clusters_found,
          relationships_created: result.relationships_created,
          relationships_merged: result.relationships_merged,
          relationships_split: result.relationships_split,
          skipped_by_haiku: result.skipped_by_haiku,
          abstractions_created: result.abstractions_created,
          duration_ms: result.duration_ms,
        },
      });

      this.logger.info('REM job complete', {
        job_id: jobId,
        ...result,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('REM job failed', {
        job_id: jobId,
        collection_id,
        error: message,
      });

      await this.jobService.complete(jobId, {
        status: 'failed',
        error: { code: 'rem_cycle_failed', message },
      });
    }
  }
}

// ─── Scheduler ──────────────────────────────────────────────────────────

/**
 * Enumerate qualifying collections and create REM jobs.
 * Called by the daily Cloud Scheduler cron.
 */
export async function scheduleRemJobs(
  jobService: JobService,
  collectionEnumerator: () => AsyncIterable<string>,
  logger: Logger,
): Promise<{ jobs_created: number }> {
  let jobsCreated = 0;

  for await (const collectionId of collectionEnumerator()) {
    await jobService.create({
      type: 'rem_cycle',
      user_id: null,
      params: { collection_id: collectionId },
      ttl_hours: 24,
    });
    jobsCreated++;
  }

  logger.info('REM jobs scheduled', { jobs_created: jobsCreated });
  return { jobs_created: jobsCreated };
}
