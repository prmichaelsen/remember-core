import { ImportJobWorker } from './import-job.worker.js';
import type { JobService } from './job.service.js';
import type { MemoryService } from './memory.service.js';
import type { RelationshipService } from './relationship.service.js';
import type { HaikuClient } from './rem.haiku.js';
import type { Logger } from '../utils/logger.js';
import type { JobStep } from './job.types.js';

// ─── Mock Factories ─────────────────────────────────────────────────────

function createMockJobService() {
  const steps: JobStep[] = [];
  let cancelled = false;

  return {
    addStep: jest.fn(async (_jobId: string, step: JobStep) => {
      steps.push(step);
    }),
    updateStep: jest.fn(async (_jobId: string, stepId: string, update: Partial<JobStep>) => {
      const idx = steps.findIndex((s) => s.id === stepId);
      if (idx >= 0) steps[idx] = { ...steps[idx], ...update };
    }),
    updateProgress: jest.fn(),
    complete: jest.fn(),
    isCancelled: jest.fn(async () => cancelled),
    cancel: jest.fn(async () => { cancelled = true; }),
    _setCancelled: (val: boolean) => { cancelled = val; },
    _getSteps: () => steps,
  } as unknown as jest.Mocked<JobService> & {
    _setCancelled: (val: boolean) => void;
    _getSteps: () => JobStep[];
  };
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
    extractFeatures: jest.fn().mockResolvedValue({
      keywords: ['test'],
      topics: ['testing'],
      themes: ['verification'],
      summary: 'A test document about various topics.',
    }),
  };
}

function createMockLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('ImportJobWorker', () => {
  let worker: ImportJobWorker;
  let mockJobService: ReturnType<typeof createMockJobService>;
  let mockMemory: jest.Mocked<MemoryService>;
  let mockRelationship: jest.Mocked<RelationshipService>;
  let mockHaiku: jest.Mocked<HaikuClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockJobService = createMockJobService();
    mockMemory = createMockMemoryService();
    mockRelationship = createMockRelationshipService();
    mockHaiku = createMockHaikuClient();
    mockLogger = createMockLogger();

    worker = new ImportJobWorker(
      mockJobService as unknown as JobService,
      mockMemory,
      mockRelationship,
      mockHaiku,
      mockLogger,
    );
  });

  describe('happy path', () => {
    it('processes a single item with a single chunk', async () => {
      await worker.execute('job-1', 'user-1', {
        items: [{ content: 'Short text.' }],
      });

      // 1 step registered
      expect(mockJobService.addStep).toHaveBeenCalledTimes(1);

      // 1 chunk memory + 1 parent memory = 2 creates
      expect(mockMemory.create).toHaveBeenCalledTimes(2);

      // 1 relationship (chunk → parent)
      expect(mockRelationship.create).toHaveBeenCalledTimes(1);

      // Completed successfully
      expect(mockJobService.complete).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: 'completed',
      }));
    });

    it('processes multiple items with multiple chunks', async () => {
      const p1 = 'a'.repeat(40);
      const p2 = 'b'.repeat(40);
      const p3 = 'c'.repeat(40);

      await worker.execute('job-1', 'user-1', {
        items: [
          { content: `${p1}\n\n${p2}\n\n${p3}`, source_filename: 'file1.txt' },
          { content: 'Short text.', source_filename: 'file2.txt' },
        ],
        chunk_size: 15,
      });

      // 3 chunks from item 1 + 1 chunk from item 2 = 4 steps
      expect(mockJobService.addStep).toHaveBeenCalledTimes(4);

      // 4 chunk memories + 2 parent memories = 6 creates
      expect(mockMemory.create).toHaveBeenCalledTimes(6);

      // 4 relationships (1 per chunk to its parent)
      expect(mockRelationship.create).toHaveBeenCalledTimes(4);

      expect(mockJobService.complete).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: 'completed',
      }));
    });
  });

  describe('progress updates', () => {
    it('updates progress after each chunk', async () => {
      const p1 = 'a'.repeat(40);
      const p2 = 'b'.repeat(40);
      const p3 = 'c'.repeat(40);

      await worker.execute('job-1', 'user-1', {
        items: [{ content: `${p1}\n\n${p2}\n\n${p3}` }],
        chunk_size: 15,
      });

      // 3 chunks → 3 progress updates
      expect(mockJobService.updateProgress).toHaveBeenCalledTimes(3);
      expect(mockJobService.updateProgress).toHaveBeenNthCalledWith(1, 'job-1', {
        progress: 33,
        current_step: 'Processing chunk 1 of 3',
      });
      expect(mockJobService.updateProgress).toHaveBeenNthCalledWith(2, 'job-1', {
        progress: 67,
        current_step: 'Processing chunk 2 of 3',
      });
      expect(mockJobService.updateProgress).toHaveBeenNthCalledWith(3, 'job-1', {
        progress: 100,
        current_step: 'Processing chunk 3 of 3',
      });
    });
  });

  describe('empty items', () => {
    it('completes immediately with 0 steps', async () => {
      await worker.execute('job-1', 'user-1', {
        items: [{ content: '' }],
      });

      expect(mockJobService.addStep).not.toHaveBeenCalled();
      expect(mockJobService.complete).toHaveBeenCalledWith('job-1', {
        status: 'completed',
        result: { items: [], total_memories_created: 0 },
      });
    });
  });

  describe('cancellation', () => {
    it('stops after cancellation and marks job cancelled', async () => {
      let callCount = 0;
      (mockJobService.isCancelled as jest.Mock).mockImplementation(async () => {
        callCount++;
        return callCount > 1; // Cancel after first chunk
      });

      const p1 = 'a'.repeat(40);
      const p2 = 'b'.repeat(40);
      const p3 = 'c'.repeat(40);

      await worker.execute('job-1', 'user-1', {
        items: [{ content: `${p1}\n\n${p2}\n\n${p3}` }],
        chunk_size: 15,
      });

      // Only processed 1 chunk before cancellation was detected
      expect(mockMemory.create).toHaveBeenCalledTimes(1);
      expect(mockJobService.complete).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: 'cancelled',
      }));
    });
  });

  describe('partial failure', () => {
    it('marks job completed_with_errors when some chunks fail', async () => {
      let createCount = 0;
      (mockMemory.create as jest.Mock).mockImplementation(() => {
        createCount++;
        if (createCount === 2) {
          return Promise.reject(new Error('Chunk 2 failed'));
        }
        return Promise.resolve({
          memory_id: `mem-${createCount}`,
          created_at: new Date().toISOString(),
        });
      });

      const p1 = 'a'.repeat(40);
      const p2 = 'b'.repeat(40);
      const p3 = 'c'.repeat(40);

      await worker.execute('job-1', 'user-1', {
        items: [{ content: `${p1}\n\n${p2}\n\n${p3}` }],
        chunk_size: 15,
      });

      // Step 2 should be marked failed
      const failedStepCall = (mockJobService.updateStep as jest.Mock).mock.calls.find(
        (call: any[]) => call[1] === 'chunk-1' && call[2].status === 'failed',
      );
      expect(failedStepCall).toBeDefined();
      expect(failedStepCall![2].error).toEqual({
        code: 'chunk_failed',
        message: 'Chunk 2 failed',
        step_id: 'chunk-1',
      });

      expect(mockJobService.complete).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: 'completed_with_errors',
        error: { code: 'partial_failure', message: '1 chunk(s) failed' },
      }));
    });

    it('marks job failed when all chunks fail', async () => {
      (mockMemory.create as jest.Mock).mockRejectedValue(new Error('All chunks fail'));

      await worker.execute('job-1', 'user-1', {
        items: [{ content: 'Short text.' }],
      });

      expect(mockJobService.complete).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: 'failed',
      }));
    });
  });

  describe('step tracking', () => {
    it('marks steps running then completed', async () => {
      await worker.execute('job-1', 'user-1', {
        items: [{ content: 'Short text.' }],
      });

      const updateCalls = (mockJobService.updateStep as jest.Mock).mock.calls;

      // First call: mark running
      expect(updateCalls[0]).toEqual([
        'job-1',
        'chunk-0',
        expect.objectContaining({ status: 'running' }),
      ]);

      // Second call: mark completed
      expect(updateCalls[1]).toEqual([
        'job-1',
        'chunk-0',
        expect.objectContaining({ status: 'completed' }),
      ]);
    });
  });

  describe('HaikuClient fallback', () => {
    it('uses default summary when HaikuClient fails', async () => {
      mockHaiku.extractFeatures.mockRejectedValue(new Error('API error'));

      await worker.execute('job-1', 'user-1', {
        items: [{ content: 'Some content.' }],
      });

      expect(mockJobService.complete).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: 'completed',
      }));

      // Parent memory created with default summary
      const parentCall = (mockMemory.create as jest.Mock).mock.calls[1][0];
      expect(parentCall.content).toContain('Imported 1 chunks from pasted text');
    });
  });

  describe('relationships', () => {
    it('creates part_of relationships with source=rule', async () => {
      await worker.execute('job-1', 'user-1', {
        items: [{ content: 'Some content.' }],
      });

      const relCall = (mockRelationship.create as jest.Mock).mock.calls[0][0];
      expect(relCall.relationship_type).toBe('part_of');
      expect(relCall.source).toBe('rule');
    });
  });
});
