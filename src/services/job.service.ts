/**
 * JobService — Firestore CRUD for job state tracking.
 *
 * Provides create, read, update, and cleanup operations for async job records.
 * Workers (ImportJobWorker, RemJobWorker) use this to report progress.
 * REST endpoints use this to serve poll requests.
 */

import {
  getDocument,
  setDocument,
  updateDocument,
  deleteDocument,
  queryDocuments,
  type QueryOptions,
} from '../database/firestore/init.js';
import { BASE } from '../database/firestore/paths.js';
import type { Logger } from '../utils/logger.js';
import type {
  Job,
  JobStep,
  JobStatus,
  CreateJobInput,
  JobProgressUpdate,
  CompleteJobInput,
} from './job.types.js';

// ─── Constants ──────────────────────────────────────────────────────────

const JOBS_COLLECTION = `${BASE}.jobs`;

// ─── Service ────────────────────────────────────────────────────────────

export interface JobServiceDeps {
  logger: Logger;
}

export class JobService {
  private logger: Logger;

  constructor(deps: JobServiceDeps) {
    this.logger = deps.logger;
  }

  async create(input: CreateJobInput): Promise<Job> {
    const now = new Date().toISOString();
    const id = globalThis.crypto.randomUUID();

    const job: Job = {
      id,
      type: input.type,
      status: 'pending',
      progress: 0,
      current_step: null,
      steps: input.steps ?? [],
      user_id: input.user_id,
      params: input.params,
      result: null,
      error: null,
      ttl_hours: input.ttl_hours,
      created_at: now,
      updated_at: now,
      started_at: null,
      completed_at: null,
    };

    await setDocument(JOBS_COLLECTION, id, job as unknown as Record<string, unknown>);

    this.logger.info('Job created', { job_id: id, type: input.type });
    return job;
  }

  async getStatus(jobId: string): Promise<Job | null> {
    const doc = await getDocument(JOBS_COLLECTION, jobId);
    if (!doc) return null;
    return doc as unknown as Job;
  }

  async listByUser(
    userId: string,
    options?: { status?: JobStatus; limit?: number },
  ): Promise<Job[]> {
    const where: QueryOptions['where'] = [
      { field: 'user_id', op: '==', value: userId },
    ];

    if (options?.status) {
      where.push({ field: 'status', op: '==', value: options.status });
    }

    const queryOpts: QueryOptions = {
      where,
      orderBy: [{ field: 'created_at', direction: 'DESCENDING' }],
      limit: options?.limit ?? 50,
    };

    const results = await queryDocuments(JOBS_COLLECTION, queryOpts);
    return results.map((r) => r.data as unknown as Job);
  }

  async updateProgress(jobId: string, update: JobProgressUpdate): Promise<void> {
    const now = new Date().toISOString();
    const job = await this.getStatus(jobId);
    // Don't overwrite cancelled/terminal status with 'running'
    const status = job && job.status !== 'cancelled' ? 'running' : job?.status ?? 'running';
    await updateDocument(JOBS_COLLECTION, jobId, {
      progress: update.progress,
      current_step: update.current_step,
      status,
      updated_at: now,
      ...(job && !job.started_at ? { started_at: now } : {}),
    });
  }

  async addStep(jobId: string, step: JobStep): Promise<void> {
    const job = await this.getStatus(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const steps = [...job.steps, step];
    await updateDocument(JOBS_COLLECTION, jobId, {
      steps: steps as unknown as Record<string, unknown>[],
      updated_at: new Date().toISOString(),
    });
  }

  async updateStep(jobId: string, stepId: string, update: Partial<JobStep>): Promise<void> {
    const job = await this.getStatus(jobId);
    if (!job) throw new Error(`Job not found: ${jobId}`);

    const steps = job.steps.map((s) =>
      s.id === stepId ? { ...s, ...update } : s,
    );

    await updateDocument(JOBS_COLLECTION, jobId, {
      steps: steps as unknown as Record<string, unknown>[],
      updated_at: new Date().toISOString(),
    });
  }

  async complete(jobId: string, input: CompleteJobInput): Promise<void> {
    const now = new Date().toISOString();
    await updateDocument(JOBS_COLLECTION, jobId, {
      status: input.status,
      result: input.result ?? null,
      error: input.error ?? null,
      completed_at: now,
      updated_at: now,
      progress: 100,
    });

    this.logger.info('Job completed', { job_id: jobId, status: input.status });
  }

  async cancel(jobId: string): Promise<void> {
    await updateDocument(JOBS_COLLECTION, jobId, {
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    this.logger.info('Job cancelled', { job_id: jobId });
  }

  async isCancelled(jobId: string): Promise<boolean> {
    const job = await this.getStatus(jobId);
    return job?.status === 'cancelled';
  }

  async cleanupExpired(): Promise<number> {
    const now = Date.now();
    const terminalStatuses: JobStatus[] = [
      'completed',
      'completed_with_errors',
      'failed',
      'cancelled',
    ];

    let deleted = 0;

    for (const status of terminalStatuses) {
      const results = await queryDocuments(JOBS_COLLECTION, {
        where: [{ field: 'status', op: '==', value: status }],
        limit: 500,
      });

      for (const result of results) {
        const job = result.data as unknown as Job;
        if (!job.completed_at) continue;

        const completedAt = new Date(job.completed_at).getTime();
        const expiresAt = completedAt + job.ttl_hours * 60 * 60 * 1000;

        if (expiresAt < now) {
          await deleteDocument(JOBS_COLLECTION, job.id);
          deleted++;
        }
      }
    }

    this.logger.info('Job cleanup complete', { deleted });
    return deleted;
  }
}
