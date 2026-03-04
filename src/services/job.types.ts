/**
 * Job Tracking System types.
 *
 * Defines job state, step tracking, error reporting, and service input types
 * used by JobService and job workers (ImportJobWorker, RemJobWorker).
 */

// ─── Enums / Unions ─────────────────────────────────────────────────────

export type JobType = 'import' | 'rem_cycle';

export type JobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'cancelled'
  | 'paused';

export type JobStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** Terminal statuses — job is done and will not change again. */
export const TERMINAL_STATUSES: ReadonlySet<JobStatus> = new Set([
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
]);

// ─── Core Types ─────────────────────────────────────────────────────────

export interface JobError {
  code: string;
  message: string;
  step_id?: string;
}

export interface JobStep {
  id: string;
  label: string;
  status: JobStepStatus;
  started_at: string | null;
  completed_at: string | null;
  error: JobError | null;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  current_step: string | null;
  steps: JobStep[];
  user_id: string | null;
  params: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: JobError | null;
  ttl_hours: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// ─── Service Input Types ────────────────────────────────────────────────

export interface CreateJobInput {
  type: JobType;
  user_id: string | null;
  params: Record<string, unknown>;
  ttl_hours: number;
  steps?: JobStep[];
}

export interface JobProgressUpdate {
  progress: number;
  current_step: string;
}

export interface CompleteJobInput {
  status: 'completed' | 'completed_with_errors' | 'failed' | 'cancelled';
  result?: Record<string, unknown>;
  error?: JobError;
}

// ─── Defaults ───────────────────────────────────────────────────────────

export const DEFAULT_TTL_HOURS: Record<JobType, number> = {
  import: 1,
  rem_cycle: 24,
};
