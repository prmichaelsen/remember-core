/**
 * AccountDeletionJobWorker — executes account deletion as tracked job steps.
 *
 * Deletes all user data from Weaviate and Firestore via UserDeletionService,
 * reporting progress through JobService.
 */

import type { Logger } from '../utils/logger.js';
import type { EventBus } from '../webhooks/events.js';
import type { JobService } from './job.service.js';
import { UserDeletionService } from './user-deletion.service.js';

// ─── Types ──────────────────────────────────────────────────────────────

export interface AccountDeletionJobParams {
  user_id: string;
}

// ─── Steps ──────────────────────────────────────────────────────────────

const DELETION_STEPS = [
  { id: 'weaviate-collections', label: 'Deleting Weaviate collections' },
  { id: 'firestore-user-data', label: 'Deleting Firestore user data' },
  { id: 'ratings-retraction', label: 'Retracting user ratings' },
  { id: 'preference-centroids', label: 'Cleaning up preference centroids' },
  { id: 'collection-registry', label: 'Cleaning up collection registry' },
  { id: 'memory-index', label: 'Cleaning up memory index' },
  { id: 'user-permissions', label: 'Cleaning up user permissions' },
] as const;

// ─── Worker ─────────────────────────────────────────────────────────────

export class AccountDeletionJobWorker {
  constructor(
    private jobService: JobService,
    private logger: Logger,
    private eventBus?: EventBus | null,
  ) {}

  async execute(jobId: string, params: AccountDeletionJobParams): Promise<void> {
    const { user_id } = params;

    // Register steps upfront
    for (const step of DELETION_STEPS) {
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
    await this.jobService.updateStep(jobId, 'weaviate-collections', {
      status: 'running',
      started_at: new Date().toISOString(),
    });

    await this.jobService.updateProgress(jobId, {
      progress: 0,
      current_step: 'Deleting Weaviate collections',
    });

    try {
      // Check cancellation before starting
      if (await this.jobService.isCancelled(jobId)) {
        await this.jobService.complete(jobId, {
          status: 'cancelled',
          result: { user_id },
        });
        return;
      }

      // Run the full deletion via UserDeletionService
      const deletionService = new UserDeletionService();
      const result = await deletionService.deleteUserData({ user_id });

      // Mark all steps completed
      const now = new Date().toISOString();
      for (let i = 0; i < DELETION_STEPS.length; i++) {
        await this.jobService.updateStep(jobId, DELETION_STEPS[i].id, {
          status: 'completed',
          started_at: now,
          completed_at: now,
        });

        await this.jobService.updateProgress(jobId, {
          progress: Math.round(((i + 1) / DELETION_STEPS.length) * 100),
          current_step: DELETION_STEPS[i].label,
        });
      }

      // Complete job with result stats
      const status = result.errors.length > 0 ? 'completed_with_errors' as const : 'completed' as const;
      await this.jobService.complete(jobId, {
        status,
        result: {
          user_id,
          weaviate_collections: result.deleted.weaviate_collections,
          firestore_paths: result.deleted.firestore_paths,
          ratings_retracted: result.deleted.ratings_retracted,
          errors: result.errors,
        },
      });

      if (this.eventBus) {
        await this.eventBus.emit({
          type: 'account.deleted',
          user_id,
          job_id: jobId,
          errors: result.errors,
        }, { type: 'system', id: 'deletion-worker' });
      }

      this.logger.info('Account deletion job complete', {
        job_id: jobId,
        user_id,
        weaviate_collections: result.deleted.weaviate_collections.length,
        firestore_paths: result.deleted.firestore_paths.length,
        ratings_retracted: result.deleted.ratings_retracted,
        errors: result.errors.length,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error('Account deletion job failed', {
        job_id: jobId,
        user_id,
        error: message,
      });

      await this.jobService.complete(jobId, {
        status: 'failed',
        error: { code: 'account_deletion_failed', message },
      });
    }
  }
}
