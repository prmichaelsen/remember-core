import type { Logger } from '../utils/logger.js';
import type { Job } from './job.types.js';

// ─── Firestore Mock ─────────────────────────────────────────────────────

const store = new Map<string, any>();

jest.mock('../database/firestore/init.js', () => ({
  getDocument: jest.fn(async (collectionPath: string, docId: string) => {
    return store.get(`${collectionPath}/${docId}`) ?? null;
  }),
  setDocument: jest.fn(async (collectionPath: string, docId: string, data: any) => {
    store.set(`${collectionPath}/${docId}`, data);
  }),
  updateDocument: jest.fn(async (collectionPath: string, docId: string, data: any) => {
    const key = `${collectionPath}/${docId}`;
    const existing = store.get(key);
    if (!existing) throw new Error(`Document not found: ${key}`);
    store.set(key, { ...existing, ...data });
  }),
  deleteDocument: jest.fn(async (collectionPath: string, docId: string) => {
    store.delete(`${collectionPath}/${docId}`);
  }),
  queryDocuments: jest.fn(async (collectionPath: string, options: any) => {
    const entries = Array.from(store.entries())
      .filter(([key]) => key.startsWith(collectionPath + '/'))
      .map(([key, data]) => ({
        id: key.split('/').pop()!,
        data,
      }));

    // Apply where filters
    let filtered = entries;
    if (options?.where) {
      for (const clause of options.where) {
        filtered = filtered.filter((e) => {
          const val = e.data[clause.field];
          if (clause.op === '==') return val === clause.value;
          return true;
        });
      }
    }

    // Apply orderBy (simple desc sort on created_at)
    if (options?.orderBy?.field === 'created_at' && options.orderBy.direction === 'desc') {
      filtered.sort((a, b) => (b.data.created_at ?? '').localeCompare(a.data.created_at ?? ''));
    }

    // Apply limit
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }),
}));

jest.mock('../database/firestore/paths.js', () => ({
  BASE: 'test',
}));

import { JobService } from './job.service.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function createMockLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('JobService', () => {
  let service: JobService;
  let logger: jest.Mocked<Logger>;

  beforeEach(() => {
    store.clear();
    logger = createMockLogger();
    service = new JobService({ logger });
  });

  describe('create', () => {
    it('creates a job with correct defaults', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: { items: [] },
        ttl_hours: 1,
      });

      expect(job.id).toBeDefined();
      expect(job.type).toBe('import');
      expect(job.status).toBe('pending');
      expect(job.progress).toBe(0);
      expect(job.current_step).toBeNull();
      expect(job.steps).toEqual([]);
      expect(job.user_id).toBe('user-1');
      expect(job.params).toEqual({ items: [] });
      expect(job.result).toBeNull();
      expect(job.error).toBeNull();
      expect(job.ttl_hours).toBe(1);
      expect(job.created_at).toBeDefined();
      expect(job.updated_at).toBeDefined();
      expect(job.started_at).toBeNull();
      expect(job.completed_at).toBeNull();
    });

    it('persists job to Firestore', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      const retrieved = await service.getStatus(job.id);
      expect(retrieved).toEqual(job);
    });

    it('accepts pre-defined steps', async () => {
      const steps = [
        { id: 'step-1', label: 'Step 1', status: 'pending' as const, started_at: null, completed_at: null, error: null },
      ];

      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
        steps,
      });

      expect(job.steps).toEqual(steps);
    });

    it('supports null user_id for system jobs', async () => {
      const job = await service.create({
        type: 'rem_cycle',
        user_id: null,
        params: { collection_id: 'col-1' },
        ttl_hours: 24,
      });

      expect(job.user_id).toBeNull();
    });
  });

  describe('getStatus', () => {
    it('returns job when found', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      const result = await service.getStatus(job.id);
      expect(result).toEqual(job);
    });

    it('returns null when not found', async () => {
      const result = await service.getStatus('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listByUser', () => {
    it('returns jobs for a user', async () => {
      await service.create({ type: 'import', user_id: 'user-1', params: {}, ttl_hours: 1 });
      await service.create({ type: 'import', user_id: 'user-1', params: {}, ttl_hours: 1 });
      await service.create({ type: 'import', user_id: 'user-2', params: {}, ttl_hours: 1 });

      const jobs = await service.listByUser('user-1');
      expect(jobs).toHaveLength(2);
      expect(jobs.every((j) => j.user_id === 'user-1')).toBe(true);
    });

    it('filters by status', async () => {
      const job1 = await service.create({ type: 'import', user_id: 'user-1', params: {}, ttl_hours: 1 });
      await service.create({ type: 'import', user_id: 'user-1', params: {}, ttl_hours: 1 });

      await service.complete(job1.id, { status: 'completed' });

      const jobs = await service.listByUser('user-1', { status: 'completed' });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].status).toBe('completed');
    });

    it('respects limit', async () => {
      for (let i = 0; i < 5; i++) {
        await service.create({ type: 'import', user_id: 'user-1', params: {}, ttl_hours: 1 });
      }

      const jobs = await service.listByUser('user-1', { limit: 2 });
      expect(jobs).toHaveLength(2);
    });
  });

  describe('updateProgress', () => {
    it('updates progress, current_step, and status to running', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      await service.updateProgress(job.id, {
        progress: 50,
        current_step: 'Processing chunk 5/10',
      });

      const updated = await service.getStatus(job.id);
      expect(updated!.progress).toBe(50);
      expect(updated!.current_step).toBe('Processing chunk 5/10');
      expect(updated!.status).toBe('running');
      expect(updated!.started_at).toBeDefined();
    });
  });

  describe('addStep', () => {
    it('appends a step to the steps array', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      await service.addStep(job.id, {
        id: 'chunk-0',
        label: 'Processing chunk 1 of 3',
        status: 'pending',
        started_at: null,
        completed_at: null,
        error: null,
      });

      const updated = await service.getStatus(job.id);
      expect(updated!.steps).toHaveLength(1);
      expect(updated!.steps[0].id).toBe('chunk-0');
    });

    it('throws when job not found', async () => {
      await expect(
        service.addStep('nonexistent', {
          id: 'step', label: 'Step', status: 'pending',
          started_at: null, completed_at: null, error: null,
        }),
      ).rejects.toThrow('Job not found: nonexistent');
    });
  });

  describe('updateStep', () => {
    it('updates a specific step by id', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      await service.addStep(job.id, {
        id: 'chunk-0',
        label: 'Processing chunk 1',
        status: 'pending',
        started_at: null,
        completed_at: null,
        error: null,
      });

      const now = new Date().toISOString();
      await service.updateStep(job.id, 'chunk-0', {
        status: 'running',
        started_at: now,
      });

      const updated = await service.getStatus(job.id);
      expect(updated!.steps[0].status).toBe('running');
      expect(updated!.steps[0].started_at).toBe(now);
    });

    it('does not modify other steps', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      await service.addStep(job.id, {
        id: 'chunk-0', label: 'Chunk 0', status: 'pending',
        started_at: null, completed_at: null, error: null,
      });
      await service.addStep(job.id, {
        id: 'chunk-1', label: 'Chunk 1', status: 'pending',
        started_at: null, completed_at: null, error: null,
      });

      await service.updateStep(job.id, 'chunk-0', { status: 'completed' });

      const updated = await service.getStatus(job.id);
      expect(updated!.steps[0].status).toBe('completed');
      expect(updated!.steps[1].status).toBe('pending');
    });

    it('throws when job not found', async () => {
      await expect(
        service.updateStep('nonexistent', 'step', { status: 'running' }),
      ).rejects.toThrow('Job not found: nonexistent');
    });
  });

  describe('complete', () => {
    it('sets terminal status and completed_at', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      await service.complete(job.id, {
        status: 'completed',
        result: { total_memories_created: 10 },
      });

      const updated = await service.getStatus(job.id);
      expect(updated!.status).toBe('completed');
      expect(updated!.completed_at).toBeDefined();
      expect(updated!.result).toEqual({ total_memories_created: 10 });
      expect(updated!.progress).toBe(100);
    });

    it('sets error on failure', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      await service.complete(job.id, {
        status: 'failed',
        error: { code: 'internal', message: 'Something went wrong' },
      });

      const updated = await service.getStatus(job.id);
      expect(updated!.status).toBe('failed');
      expect(updated!.error).toEqual({ code: 'internal', message: 'Something went wrong' });
    });

    it('handles completed_with_errors status', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      await service.complete(job.id, {
        status: 'completed_with_errors',
        result: { succeeded: 8, failed: 2 },
        error: { code: 'partial_failure', message: '2 chunks failed' },
      });

      const updated = await service.getStatus(job.id);
      expect(updated!.status).toBe('completed_with_errors');
      expect(updated!.result).toEqual({ succeeded: 8, failed: 2 });
      expect(updated!.error).toEqual({ code: 'partial_failure', message: '2 chunks failed' });
    });
  });

  describe('cancel', () => {
    it('sets status to cancelled', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      await service.cancel(job.id);

      const updated = await service.getStatus(job.id);
      expect(updated!.status).toBe('cancelled');
      expect(updated!.completed_at).toBeDefined();
    });
  });

  describe('isCancelled', () => {
    it('returns true when cancelled', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      await service.cancel(job.id);
      expect(await service.isCancelled(job.id)).toBe(true);
    });

    it('returns false when not cancelled', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      expect(await service.isCancelled(job.id)).toBe(false);
    });

    it('returns false when job not found', async () => {
      expect(await service.isCancelled('nonexistent')).toBe(false);
    });
  });

  describe('cleanupExpired', () => {
    it('deletes jobs past their TTL', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      // Complete the job with a timestamp 2 hours ago
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const key = `test.jobs/${job.id}`;
      const stored = store.get(key);
      store.set(key, {
        ...stored,
        status: 'completed',
        completed_at: twoHoursAgo,
        ttl_hours: 1,
      });

      const deleted = await service.cleanupExpired();
      expect(deleted).toBe(1);
      expect(await service.getStatus(job.id)).toBeNull();
    });

    it('does not delete jobs within TTL', async () => {
      const job = await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 24,
      });

      // Complete the job now (within 24h TTL)
      await service.complete(job.id, { status: 'completed' });

      const deleted = await service.cleanupExpired();
      expect(deleted).toBe(0);
      expect(await service.getStatus(job.id)).not.toBeNull();
    });

    it('does not delete jobs without completed_at', async () => {
      await service.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      const deleted = await service.cleanupExpired();
      expect(deleted).toBe(0);
    });

    it('cleans up all terminal statuses', async () => {
      const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      for (const status of ['completed', 'completed_with_errors', 'failed', 'cancelled'] as const) {
        const job = await service.create({
          type: 'import',
          user_id: 'user-1',
          params: {},
          ttl_hours: 1,
        });
        const key = `test.jobs/${job.id}`;
        const stored = store.get(key);
        store.set(key, {
          ...stored,
          status,
          completed_at: longAgo,
          ttl_hours: 1,
        });
      }

      const deleted = await service.cleanupExpired();
      expect(deleted).toBe(4);
    });
  });
});
