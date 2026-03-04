// src/clients/svc/v1/jobs.spec.ts
import { createJobsResource } from './jobs';
import type { HttpClient } from '../../http';

function createMockHttpClient(): HttpClient {
  return {
    request: jest.fn().mockResolvedValue({ data: {}, error: null, throwOnError: () => ({}) }),
  } as unknown as HttpClient;
}

describe('JobsResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  describe('get', () => {
    it('calls GET /api/svc/v1/jobs/:id', async () => {
      const jobs = createJobsResource(http);
      await jobs.get('user-1', 'job-123');

      expect(http.request).toHaveBeenCalledWith('GET', '/api/svc/v1/jobs/job-123', {
        userId: 'user-1',
      });
    });
  });

  describe('cancel', () => {
    it('calls POST /api/svc/v1/jobs/:id/cancel', async () => {
      const jobs = createJobsResource(http);
      await jobs.cancel('user-1', 'job-123');

      expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/jobs/job-123/cancel', {
        userId: 'user-1',
      });
    });
  });

  describe('poll', () => {
    it('resolves immediately if job is already terminal', async () => {
      (http.request as jest.Mock).mockResolvedValue({
        data: { status: 'completed', progress: 100 },
        error: null,
      });

      const jobs = createJobsResource(http);
      const result = await jobs.poll('user-1', 'job-123');

      expect(result.data).toEqual({ status: 'completed', progress: 100 });
      // Only 1 request (initial check)
      expect(http.request).toHaveBeenCalledTimes(1);
    });

    it('resolves when job reaches terminal status after polling', async () => {
      let callCount = 0;
      (http.request as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount <= 2) {
          return { data: { status: 'running', progress: 50 * callCount }, error: null };
        }
        return { data: { status: 'completed', progress: 100 }, error: null };
      });

      const jobs = createJobsResource(http);
      const onProgress = jest.fn();
      const result = await jobs.poll('user-1', 'job-123', {
        intervalMs: 10,
        onProgress,
      });

      expect(result.data).toEqual({ status: 'completed', progress: 100 });
      expect(onProgress).toHaveBeenCalled();
    });

    it('calls onProgress on each poll', async () => {
      let callCount = 0;
      (http.request as jest.Mock).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          return { data: { status: 'running', progress: 33 }, error: null };
        }
        if (callCount === 2) {
          return { data: { status: 'running', progress: 66 }, error: null };
        }
        return { data: { status: 'completed', progress: 100 }, error: null };
      });

      const jobs = createJobsResource(http);
      const onProgress = jest.fn();
      await jobs.poll('user-1', 'job-123', { intervalMs: 10, onProgress });

      // 1 initial + 2 poll = 3 progress calls
      expect(onProgress).toHaveBeenCalledTimes(3);
      expect(onProgress).toHaveBeenNthCalledWith(1, { status: 'running', progress: 33 });
    });

    it('rejects on timeout', async () => {
      (http.request as jest.Mock).mockResolvedValue({
        data: { status: 'running', progress: 50 },
        error: null,
      });

      const jobs = createJobsResource(http);
      const result = await jobs.poll('user-1', 'job-123', {
        intervalMs: 10,
        timeoutMs: 50,
      });

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('poll_timeout');
    });

    it('resolves with error if initial request fails', async () => {
      (http.request as jest.Mock).mockResolvedValue({
        data: null,
        error: { code: 'not_found', message: 'Job not found', status: 404 },
      });

      const jobs = createJobsResource(http);
      const result = await jobs.poll('user-1', 'job-123');

      expect(result.error).toBeDefined();
      expect(result.error!.code).toBe('not_found');
    });

    it('handles completed_with_errors as terminal', async () => {
      (http.request as jest.Mock).mockResolvedValue({
        data: { status: 'completed_with_errors', progress: 100 },
        error: null,
      });

      const jobs = createJobsResource(http);
      const result = await jobs.poll('user-1', 'job-123');

      expect(result.data).toEqual({ status: 'completed_with_errors', progress: 100 });
    });

    it('handles cancelled as terminal', async () => {
      (http.request as jest.Mock).mockResolvedValue({
        data: { status: 'cancelled', progress: 30 },
        error: null,
      });

      const jobs = createJobsResource(http);
      const result = await jobs.poll('user-1', 'job-123');

      expect(result.data).toEqual({ status: 'cancelled', progress: 30 });
    });

    it('handles failed as terminal', async () => {
      (http.request as jest.Mock).mockResolvedValue({
        data: { status: 'failed', progress: 0 },
        error: null,
      });

      const jobs = createJobsResource(http);
      const result = await jobs.poll('user-1', 'job-123');

      expect(result.data).toEqual({ status: 'failed', progress: 0 });
    });
  });
});
