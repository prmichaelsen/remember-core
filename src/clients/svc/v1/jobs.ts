// src/clients/svc/v1/jobs.ts
// JobsResource — 1:1 mirror of /api/svc/v1/jobs routes + poll helper

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';
import { createError } from '../../response.js';

export interface PollOptions {
  /** Polling interval in ms (default: 3000) */
  intervalMs?: number;
  /** Max wait time in ms (default: 600000 = 10min) */
  timeoutMs?: number;
  /** Callback invoked on each poll with current job state */
  onProgress?: (job: Record<string, unknown>) => void;
}

const TERMINAL_STATUSES = new Set([
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
]);

export interface JobsResource {
  get(userId: string, jobId: string): Promise<SdkResponse<unknown>>;
  cancel(userId: string, jobId: string): Promise<SdkResponse<unknown>>;
  poll(userId: string, jobId: string, options?: PollOptions): Promise<SdkResponse<unknown>>;
}

export function createJobsResource(http: HttpClient): JobsResource {
  return {
    get(userId, jobId) {
      return http.request('GET', `/api/svc/v1/jobs/${jobId}`, { userId });
    },

    cancel(userId, jobId) {
      return http.request('POST', `/api/svc/v1/jobs/${jobId}/cancel`, { userId });
    },

    async poll(userId, jobId, options) {
      const intervalMs = options?.intervalMs ?? 3000;
      const timeoutMs = options?.timeoutMs ?? 600000;
      const startTime = Date.now();

      // Check current state immediately
      const initial = await http.request<Record<string, unknown>>('GET', `/api/svc/v1/jobs/${jobId}`, { userId });
      if (initial.error) return initial;

      if (initial.data && TERMINAL_STATUSES.has(initial.data.status as string)) {
        options?.onProgress?.(initial.data);
        return initial;
      }
      options?.onProgress?.(initial.data!);

      // Poll loop
      return new Promise<SdkResponse<unknown>>((resolve) => {
        const timer = setInterval(async () => {
          // Timeout check
          if (Date.now() - startTime > timeoutMs) {
            clearInterval(timer);
            resolve(createError({
              code: 'poll_timeout',
              message: `Job ${jobId} did not complete within ${timeoutMs}ms`,
              status: 408,
            }));
            return;
          }

          const result = await http.request<Record<string, unknown>>('GET', `/api/svc/v1/jobs/${jobId}`, { userId });

          if (result.error) {
            clearInterval(timer);
            resolve(result);
            return;
          }

          options?.onProgress?.(result.data!);

          if (TERMINAL_STATUSES.has(result.data!.status as string)) {
            clearInterval(timer);
            resolve(result);
          }
        }, intervalMs);
      });
    },
  };
}
