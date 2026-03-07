// Mock Firestore for storeCuratedSubScores
jest.mock('../database/firestore/init.js', () => ({
  getDocument: jest.fn(),
  setDocument: jest.fn(),
}));

jest.mock('../database/firestore/paths.js', () => ({
  getCuratedScorePath: jest.fn((collectionId: string, memoryId: string) => ({
    collectionPath: `test.curated_scores/${collectionId}/memories`,
    docId: memoryId,
  })),
}));

import {
  runCurationStep,
  type CurationMemory,
  type CurationRelationship,
  type CurationStepDeps,
} from './curation-step.service.js';

describe('runCurationStep', () => {
  const mockEditorialService = {
    evaluate: jest.fn(),
    evaluateBatch: jest.fn(),
  };

  const mockCollection = {
    data: {
      update: jest.fn(),
    },
  };

  const mockLogger = {
    info: jest.fn(),
    warn: jest.fn(),
  };

  const deps: CurationStepDeps = {
    editorialService: mockEditorialService as any,
    collection: mockCollection,
    collectionId: 'col-1',
    logger: mockLogger,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEditorialService.evaluate.mockResolvedValue({ score: 0.7, reason: 'decent' });
    mockCollection.data.update.mockResolvedValue(undefined);
  });

  it('returns zero counts for empty memories', async () => {
    const result = await runCurationStep(deps, [], []);

    expect(result.memories_scored).toBe(0);
    expect(result.editorial_evaluations).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it('evaluates editorial for unscored memories', async () => {
    const memories: CurationMemory[] = [
      {
        uuid: 'mem-1',
        properties: {
          content: 'Great memory',
          created_at: new Date().toISOString(),
          editorial_score: 0,
        },
      },
    ];

    const result = await runCurationStep(deps, memories, []);

    expect(mockEditorialService.evaluate).toHaveBeenCalledWith('Great memory');
    expect(result.editorial_evaluations).toBe(1);
    expect(result.memories_scored).toBe(1);
  });

  it('skips editorial for already-scored memories', async () => {
    const memories: CurationMemory[] = [
      {
        uuid: 'mem-1',
        properties: {
          content: 'Already scored',
          created_at: new Date().toISOString(),
          editorial_score: 0.85,
        },
      },
    ];

    const result = await runCurationStep(deps, memories, []);

    expect(mockEditorialService.evaluate).not.toHaveBeenCalled();
    expect(result.editorial_evaluations).toBe(0);
    expect(result.memories_scored).toBe(1);
  });

  it('writes curated_score to Weaviate', async () => {
    const memories: CurationMemory[] = [
      {
        uuid: 'mem-1',
        properties: {
          content: 'My memory',
          created_at: new Date().toISOString(),
          editorial_score: 0.8,
          rating_bayesian: 4.0,
        },
      },
    ];

    await runCurationStep(deps, memories, []);

    expect(mockCollection.data.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mem-1',
        properties: expect.objectContaining({
          curated_score: expect.any(Number),
          editorial_score: 0.8,
        }),
      }),
    );
  });

  it('uses relationships for PageRank and cluster quality', async () => {
    const memories: CurationMemory[] = [
      { uuid: 'a', properties: { content: 'A', created_at: new Date().toISOString(), editorial_score: 0.5 } },
      { uuid: 'b', properties: { content: 'B', created_at: new Date().toISOString(), editorial_score: 0.5 } },
    ];

    const relationships: CurationRelationship[] = [
      { source_memory_id: 'a', target_memory_id: 'b', strength: 0.9, confidence: 0.8 },
    ];

    const result = await runCurationStep(deps, memories, relationships);

    expect(result.memories_scored).toBe(2);
    // Both memories should have been scored with PageRank + cluster contributions
    expect(mockCollection.data.update).toHaveBeenCalledTimes(2);
  });

  it('handles editorial evaluation errors gracefully', async () => {
    mockEditorialService.evaluate.mockRejectedValue(new Error('LLM down'));

    const memories: CurationMemory[] = [
      { uuid: 'mem-1', properties: { content: 'Fail editorial', created_at: new Date().toISOString() } },
    ];

    const result = await runCurationStep(deps, memories, []);

    expect(result.editorial_evaluations).toBe(0);
    expect(result.memories_scored).toBe(1); // still scores with editorial_score=0
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('handles Weaviate write errors gracefully', async () => {
    mockCollection.data.update.mockRejectedValue(new Error('Weaviate down'));

    const memories: CurationMemory[] = [
      { uuid: 'mem-1', properties: { content: 'Write fail', created_at: new Date().toISOString(), editorial_score: 0.5 } },
    ];

    const result = await runCurationStep(deps, memories, []);

    expect(result.memories_scored).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('processes multiple memories in batch', async () => {
    const memories: CurationMemory[] = Array.from({ length: 5 }, (_, i) => ({
      uuid: `mem-${i}`,
      properties: {
        content: `Memory ${i}`,
        created_at: new Date().toISOString(),
        editorial_score: 0.5 + i * 0.1,
      },
    }));

    const result = await runCurationStep(deps, memories, []);

    expect(result.memories_scored).toBe(5);
    expect(mockCollection.data.update).toHaveBeenCalledTimes(5);
  });
});
