/**
 * Job system integration tests.
 *
 * Tests the full lifecycle: create → execute → poll status → cleanup.
 * Uses mocked Firestore, MemoryService, RelationshipService, and HaikuClient.
 */

import type { Logger } from '../utils/logger.js';
import type { MemoryService } from './memory.service.js';
import type { RelationshipService } from './relationship.service.js';
import type { HaikuClient } from './rem.haiku.js';
import type { Job, JobStep } from './job.types.js';

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
import { ImportJobWorker } from './import-job.worker.js';
import { TERMINAL_STATUSES } from './job.types.js';

// ─── Mock Helpers ───────────────────────────────────────────────────────

function createMockLogger(): jest.Mocked<Logger> {
  return { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
}

function createMockMemoryService() {
  let counter = 0;
  return {
    create: jest.fn().mockImplementation(() => {
      counter++;
      return Promise.resolve({
        memory_id: `mem-${counter}`,
        created_at: new Date().toISOString(),
      });
    }),
  } as unknown as jest.Mocked<MemoryService>;
}

function createMockRelationshipService() {
  let counter = 0;
  return {
    create: jest.fn().mockImplementation((input: any) => {
      counter++;
      return Promise.resolve({
        relationship_id: `rel-${counter}`,
        memory_ids: input.memory_ids,
        created_at: new Date().toISOString(),
      });
    }),
  } as unknown as jest.Mocked<RelationshipService>;
}

function createMockHaikuClient(): jest.Mocked<HaikuClient> {
  return {
    validateCluster: jest.fn(),
    evaluateCluster: jest.fn().mockResolvedValue({ confidence: 0.8, relationship_type: 'topical', observation: 'mock', strength: 0.7, tags: [], reasoning: 'mock' }),
    extractFeatures: jest.fn().mockResolvedValue({
      keywords: ['test'],
      topics: ['testing'],
      themes: ['verification'],
      summary: 'Test document summary.',
    }),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('Job System Integration', () => {
  let jobService: JobService;
  let logger: jest.Mocked<Logger>;

  beforeEach(() => {
    store.clear();
    logger = createMockLogger();
    jobService = new JobService({ logger });
  });

  describe('full import job lifecycle', () => {
    it('create → execute → verify status → cleanup', async () => {
      const mockMemory = createMockMemoryService();
      const mockRelationship = createMockRelationshipService();
      const mockHaiku = createMockHaikuClient();

      // 1. Create job
      const job = await jobService.create({
        type: 'import',
        user_id: 'user-1',
        params: { items: [{ content: 'Hello world' }] },
        ttl_hours: 1,
      });

      expect(job.status).toBe('pending');
      expect(job.progress).toBe(0);

      // 2. Execute via ImportJobWorker
      const worker = new ImportJobWorker(
        jobService,
        mockMemory,
        mockRelationship,
        mockHaiku,
        logger,
      );

      await worker.execute(job.id, 'user-1', {
        items: [{ content: 'Hello world' }],
      });

      // 3. Verify status reflects completion
      const completed = await jobService.getStatus(job.id);
      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('completed');
      expect(completed!.progress).toBe(100);
      expect(completed!.completed_at).toBeDefined();
      expect(completed!.result).toBeDefined();
      expect(TERMINAL_STATUSES.has(completed!.status)).toBe(true);

      // 4. Verify steps
      expect(completed!.steps.length).toBeGreaterThanOrEqual(1);
      expect(completed!.steps.every((s: JobStep) => s.status === 'completed')).toBe(true);

      // 5. Verify cleanup removes job after TTL
      // Simulate TTL expiration by backdating completed_at
      const key = `test.jobs/${job.id}`;
      const stored = store.get(key);
      store.set(key, {
        ...stored,
        completed_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      });

      const deleted = await jobService.cleanupExpired();
      expect(deleted).toBe(1);
      expect(await jobService.getStatus(job.id)).toBeNull();
    });
  });

  describe('cancellation flow', () => {
    it('cancel during execution → job status cancelled', async () => {
      const mockRelationship = createMockRelationshipService();
      const mockHaiku = createMockHaikuClient();

      // Create job
      const job = await jobService.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      // Create multi-chunk content (4+ chunks to ensure cancellation is detected)
      const parts = Array.from({ length: 5 }, (_, i) => String.fromCharCode(97 + i).repeat(40));
      const content = parts.join('\n\n');

      // Cancel the job after the first chunk memory is created
      let memoryCreateCount = 0;
      const mockMemory = {
        create: jest.fn().mockImplementation(async () => {
          memoryCreateCount++;
          if (memoryCreateCount === 1) {
            await jobService.cancel(job.id);
          }
          return {
            memory_id: `mem-${memoryCreateCount}`,
            created_at: new Date().toISOString(),
          };
        }),
      } as unknown as jest.Mocked<MemoryService>;

      const worker = new ImportJobWorker(
        jobService,
        mockMemory,
        mockRelationship,
        mockHaiku,
        logger,
      );

      await worker.execute(job.id, 'user-1', {
        items: [{ content }],
        chunk_size: 15,
      });

      // Verify status — complete() with 'cancelled' overwrites the cancel() status
      const result = await jobService.getStatus(job.id);
      expect(result!.status).toBe('cancelled');
      // Only 1 chunk was processed before cancellation detected
      expect(memoryCreateCount).toBe(1);
    });
  });

  describe('partial failure flow', () => {
    it('one chunk fails → completed_with_errors with error detail', async () => {
      const mockRelationship = createMockRelationshipService();
      const mockHaiku = createMockHaikuClient();

      let createCount = 0;
      const mockMemory = {
        create: jest.fn().mockImplementation(async () => {
          createCount++;
          if (createCount === 2) {
            throw new Error('Simulated chunk failure');
          }
          return {
            memory_id: `mem-${createCount}`,
            created_at: new Date().toISOString(),
          };
        }),
      } as unknown as jest.Mocked<MemoryService>;

      // Create job
      const job = await jobService.create({
        type: 'import',
        user_id: 'user-1',
        params: {},
        ttl_hours: 1,
      });

      const p1 = 'a'.repeat(40);
      const p2 = 'b'.repeat(40);
      const p3 = 'c'.repeat(40);

      const worker = new ImportJobWorker(
        jobService,
        mockMemory,
        mockRelationship,
        mockHaiku,
        logger,
      );

      await worker.execute(job.id, 'user-1', {
        items: [{ content: `${p1}\n\n${p2}\n\n${p3}` }],
        chunk_size: 15,
      });

      // Verify status
      const result = await jobService.getStatus(job.id);
      expect(result!.status).toBe('completed_with_errors');
      expect(result!.completed_at).toBeDefined();

      // Verify failed step has error
      const failedStep = result!.steps.find((s: JobStep) => s.status === 'failed');
      expect(failedStep).toBeDefined();
      expect(failedStep!.error).toBeDefined();
      expect(failedStep!.error!.code).toBe('chunk_failed');
      expect(failedStep!.error!.message).toBe('Simulated chunk failure');
    });
  });

  describe('listByUser with job data', () => {
    it('returns user jobs with correct count', async () => {
      await jobService.create({ type: 'import', user_id: 'user-1', params: {}, ttl_hours: 1 });
      await jobService.create({ type: 'import', user_id: 'user-1', params: {}, ttl_hours: 1 });
      await jobService.create({ type: 'rem_cycle', user_id: null, params: {}, ttl_hours: 24 });

      const userJobs = await jobService.listByUser('user-1');
      expect(userJobs).toHaveLength(2);
    });
  });
});
