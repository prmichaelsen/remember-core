import { RemJobWorker, scheduleRemJobs } from './rem-job.worker.js';
import type { JobService } from './job.service.js';
import type { RemService, RunCycleResult } from './rem.service.js';
import type { Logger } from '../utils/logger.js';
import type { JobStep, Job } from './job.types.js';

// ─── Mock Factories ─────────────────────────────────────────────────────

function createMockJobService() {
  const steps: JobStep[] = [];
  let cancelled = false;
  const createdJobs: any[] = [];

  return {
    addStep: jest.fn(async (_jobId: string, step: JobStep) => {
      steps.push(step);
    }),
    updateStep: jest.fn(),
    updateProgress: jest.fn(),
    complete: jest.fn(),
    isCancelled: jest.fn(async () => cancelled),
    create: jest.fn(async (input: any) => {
      const job = { id: `job-${createdJobs.length + 1}`, ...input };
      createdJobs.push(job);
      return job;
    }),
    _setCancelled: (val: boolean) => { cancelled = val; },
    _getSteps: () => steps,
    _getCreatedJobs: () => createdJobs,
  } as unknown as jest.Mocked<JobService> & {
    _setCancelled: (val: boolean) => void;
    _getSteps: () => JobStep[];
    _getCreatedJobs: () => any[];
  };
}

function createMockRemService(result?: Partial<RunCycleResult>) {
  const defaultResult: RunCycleResult = {
    collection_id: 'Memory_users_test',
    memories_scanned: 30,
    clusters_found: 5,
    relationships_created: 3,
    relationships_merged: 1,
    relationships_split: 0,
    skipped_by_haiku: 1,
    abstractions_created: 0,
    duration_ms: 5000,
    ...result,
  };

  return {
    runCycle: jest.fn().mockResolvedValue(defaultResult),
  } as unknown as jest.Mocked<RemService>;
}

function createMockLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

// ─── RemJobWorker Tests ─────────────────────────────────────────────────

describe('RemJobWorker', () => {
  let worker: RemJobWorker;
  let mockJobService: ReturnType<typeof createMockJobService>;
  let mockRemService: jest.Mocked<RemService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockJobService = createMockJobService();
    mockRemService = createMockRemService();
    mockLogger = createMockLogger();

    worker = new RemJobWorker(
      mockJobService as unknown as JobService,
      mockRemService,
      mockLogger,
    );
  });

  describe('happy path', () => {
    it('registers 7 steps and runs cycle', async () => {
      await worker.execute('job-1', { collection_id: 'Memory_users_test' });

      // 7 steps registered
      expect(mockJobService.addStep).toHaveBeenCalledTimes(7);

      // RemService.runCycle called
      expect(mockRemService.runCycle).toHaveBeenCalledTimes(1);

      // Job completed
      expect(mockJobService.complete).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: 'completed',
      }));
    });

    it('reports progress after each step', async () => {
      await worker.execute('job-1', { collection_id: 'Memory_users_test' });

      // 7 steps → should have progress updates going to 14, 29, 43, 57, 71, 86, 100
      expect(mockJobService.updateProgress).toHaveBeenCalledTimes(8); // 1 initial + 7 step completions
    });

    it('includes result stats', async () => {
      await worker.execute('job-1', { collection_id: 'Memory_users_test' });

      const completeCall = (mockJobService.complete as jest.Mock).mock.calls[0][1];
      expect(completeCall.result).toMatchObject({
        collection_id: 'Memory_users_test',
        memories_scanned: 30,
        clusters_found: 5,
        relationships_created: 3,
      });
    });
  });

  describe('cancellation', () => {
    it('cancels before starting if cancelled', async () => {
      mockJobService._setCancelled(true);

      await worker.execute('job-1', { collection_id: 'Memory_users_test' });

      expect(mockRemService.runCycle).not.toHaveBeenCalled();
      expect(mockJobService.complete).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: 'cancelled',
      }));
    });
  });

  describe('failure', () => {
    it('marks job failed when runCycle throws', async () => {
      mockRemService.runCycle.mockRejectedValue(new Error('Weaviate connection failed'));

      await worker.execute('job-1', { collection_id: 'Memory_users_test' });

      expect(mockJobService.complete).toHaveBeenCalledWith('job-1', {
        status: 'failed',
        error: {
          code: 'rem_cycle_failed',
          message: 'Weaviate connection failed',
        },
      });
    });
  });
});

// ─── scheduleRemJobs Tests ──────────────────────────────────────────────

describe('scheduleRemJobs', () => {
  let mockJobService: ReturnType<typeof createMockJobService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockJobService = createMockJobService();
    mockLogger = createMockLogger();
  });

  it('creates one job per collection', async () => {
    async function* enumerate() {
      yield 'Memory_users_user1';
      yield 'Memory_users_user2';
      yield 'Memory_users_user3';
    }

    const result = await scheduleRemJobs(
      mockJobService as unknown as JobService,
      enumerate,
      mockLogger,
    );

    expect(result.jobs_created).toBe(3);
    expect(mockJobService.create).toHaveBeenCalledTimes(3);
  });

  it('creates jobs with correct params', async () => {
    async function* enumerate() {
      yield 'Memory_users_user1';
    }

    await scheduleRemJobs(
      mockJobService as unknown as JobService,
      enumerate,
      mockLogger,
    );

    expect(mockJobService.create).toHaveBeenCalledWith({
      type: 'rem_cycle',
      user_id: null,
      params: { collection_id: 'Memory_users_user1' },
      ttl_hours: 24,
    });
  });

  it('returns 0 for empty enumeration', async () => {
    async function* enumerate() {
      // no collections
    }

    const result = await scheduleRemJobs(
      mockJobService as unknown as JobService,
      enumerate,
      mockLogger,
    );

    expect(result.jobs_created).toBe(0);
    expect(mockJobService.create).not.toHaveBeenCalled();
  });
});
