import {
  buildClassificationPrompt,
  parseClassificationResponse,
  runClassificationPipeline,
  type ClassificationPipelineDeps,
  type ClassificationPipelineResult,
} from './rem.classification.js';
import { CLASSIFICATION_BATCH_SIZE, CONTRADICTION_PRESSURE_MAGNITUDE } from './rem.constants.js';

// ─── Mock helpers ─────────────────────────────────────────────────────────

function createMockCollection(memories: any[] = []) {
  return {
    filter: {
      byProperty: () => ({
        equal: () => ({}),
      }),
    },
    query: {
      fetchObjects: jest.fn().mockResolvedValue({ objects: memories }),
      nearObject: jest.fn().mockResolvedValue({ objects: [] }),
    },
    aggregate: {
      overAll: jest.fn().mockResolvedValue({ totalCount: memories.length }),
    },
    sort: {
      byProperty: () => ({}),
    },
  };
}

function createMockMemory(id: string, content: string): any {
  return {
    uuid: id,
    properties: {
      content,
      content_type: 'text',
      doc_type: 'memory',
      created_at: new Date().toISOString(),
    },
  };
}

function createMockClassificationService() {
  const index = {
    genres: {} as Record<string, string[]>,
    thematic_groups: {} as Record<string, string[]>,
    quality: {} as Record<string, string[]>,
    merge_candidates: [] as any[],
    last_updated: new Date().toISOString(),
    unclassified_count: 0,
  };

  return {
    getOrInitialize: jest.fn().mockResolvedValue(index),
    classify: jest.fn().mockResolvedValue(undefined),
    addMergeCandidate: jest.fn().mockResolvedValue(undefined),
    setUnclassifiedCount: jest.fn().mockResolvedValue(undefined),
    getClassifications: jest.fn().mockResolvedValue(index),
    getByGenre: jest.fn().mockResolvedValue([]),
    getByQuality: jest.fn().mockResolvedValue([]),
    getByThematicGroup: jest.fn().mockResolvedValue([]),
    getUnclassifiedCount: jest.fn().mockResolvedValue(0),
    getMergeCandidates: jest.fn().mockResolvedValue([]),
    removeFromIndex: jest.fn().mockResolvedValue(undefined),
    initializeIndex: jest.fn().mockResolvedValue(index),
  };
}

function createMockSubLlm(response: string) {
  return {
    score: jest.fn().mockResolvedValue(response),
  };
}

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

const VALID_RESPONSE = JSON.stringify({
  genre: 'essay',
  qualities: ['substantive'],
  thematic_groups: ['artificial_intelligence', 'machine_learning'],
  is_duplicate: false,
  duplicate_of: null,
  merge_candidates: [],
  contradictions: [],
});

// ─── buildClassificationPrompt ────────────────────────────────────────────

describe('buildClassificationPrompt', () => {
  it('includes memory content and genre list', () => {
    const prompt = buildClassificationPrompt(
      { id: 'mem-1', content: 'My test memory about AI' },
      [],
    );
    expect(prompt).toContain('My test memory about AI');
    expect(prompt).toContain('short_story');
    expect(prompt).toContain('essay');
    expect(prompt).toContain('other');
    expect(prompt).toContain('substantive');
  });

  it('includes neighbor content when provided', () => {
    const prompt = buildClassificationPrompt(
      { id: 'mem-1', content: 'About AI' },
      [{ id: 'mem-2', content: 'Similar AI topic', similarity: 0.85 }],
    );
    expect(prompt).toContain('Similar AI topic');
    expect(prompt).toContain('0.850');
  });

  it('shows "No similar memories" when no neighbors', () => {
    const prompt = buildClassificationPrompt(
      { id: 'mem-1', content: 'Test' },
      [],
    );
    expect(prompt).toContain('No similar memories found');
  });

  it('truncates long content to 2000 chars', () => {
    const longContent = 'x'.repeat(3000);
    const prompt = buildClassificationPrompt(
      { id: 'mem-1', content: longContent },
      [],
    );
    // Content is sliced to 2000 chars, so prompt should not contain full 3000
    expect(prompt).not.toContain('x'.repeat(2001));
  });
});

// ─── parseClassificationResponse ──────────────────────────────────────────

describe('parseClassificationResponse', () => {
  it('parses valid JSON response', () => {
    const result = parseClassificationResponse(VALID_RESPONSE);
    expect(result).not.toBeNull();
    expect(result!.genre).toBe('essay');
    expect(result!.qualities).toEqual(['substantive']);
    expect(result!.thematic_groups).toEqual(['artificial_intelligence', 'machine_learning']);
    expect(result!.is_duplicate).toBe(false);
  });

  it('strips markdown fences', () => {
    const wrapped = '```json\n' + VALID_RESPONSE + '\n```';
    const result = parseClassificationResponse(wrapped);
    expect(result).not.toBeNull();
    expect(result!.genre).toBe('essay');
  });

  it('defaults invalid genre to "other"', () => {
    const response = JSON.stringify({ genre: 'invalid_genre', qualities: ['substantive'] });
    const result = parseClassificationResponse(response);
    expect(result!.genre).toBe('other');
  });

  it('filters invalid quality signals', () => {
    const response = JSON.stringify({ genre: 'essay', qualities: ['substantive', 'made_up'] });
    const result = parseClassificationResponse(response);
    expect(result!.qualities).toEqual(['substantive']);
  });

  it('defaults to substantive if no valid qualities', () => {
    const response = JSON.stringify({ genre: 'essay', qualities: ['invalid'] });
    const result = parseClassificationResponse(response);
    expect(result!.qualities).toEqual(['substantive']);
  });

  it('normalizes thematic groups to snake_case', () => {
    const response = JSON.stringify({
      genre: 'essay',
      qualities: ['substantive'],
      thematic_groups: ['Machine Learning', 'deep-learning'],
    });
    const result = parseClassificationResponse(response);
    expect(result!.thematic_groups).toEqual(['machine_learning', 'deep_learning']);
  });

  it('returns null for invalid JSON', () => {
    expect(parseClassificationResponse('not json')).toBeNull();
  });

  it('handles duplicate detection', () => {
    const response = JSON.stringify({
      genre: 'essay',
      qualities: ['duplicate'],
      thematic_groups: [],
      is_duplicate: true,
      duplicate_of: 'mem-2',
    });
    const result = parseClassificationResponse(response);
    expect(result!.is_duplicate).toBe(true);
    expect(result!.duplicate_of).toBe('mem-2');
  });

  it('handles merge candidates', () => {
    const response = JSON.stringify({
      genre: 'essay',
      qualities: ['substantive'],
      thematic_groups: [],
      merge_candidates: [{ memory_id: 'mem-3', reason: 'similar topic' }],
    });
    const result = parseClassificationResponse(response);
    expect(result!.merge_candidates).toHaveLength(1);
    expect(result!.merge_candidates![0].memory_id).toBe('mem-3');
  });

  it('handles contradictions', () => {
    const response = JSON.stringify({
      genre: 'journal_entry',
      qualities: ['substantive'],
      thematic_groups: [],
      contradictions: [{ memory_id: 'mem-4', description: 'conflicting views on camping' }],
    });
    const result = parseClassificationResponse(response);
    expect(result!.contradictions).toHaveLength(1);
  });
});

// ─── runClassificationPipeline ────────────────────────────────────────────

describe('runClassificationPipeline', () => {
  it('returns zeros when no unclassified memories', async () => {
    const collection = createMockCollection([]);
    const deps: ClassificationPipelineDeps = {
      collection,
      collectionId: 'Memory_users_test',
      subLlm: createMockSubLlm(VALID_RESPONSE),
      classificationService: createMockClassificationService() as any,
      logger: createMockLogger() as any,
    };

    const result = await runClassificationPipeline(deps);
    expect(result.memories_classified).toBe(0);
    expect(result.memories_skipped).toBe(0);
  });

  it('classifies unclassified memories', async () => {
    const memories = [createMockMemory('mem-1', 'A great essay about life')];
    const collection = createMockCollection(memories);
    const classService = createMockClassificationService();
    const subLlm = createMockSubLlm(VALID_RESPONSE);

    const deps: ClassificationPipelineDeps = {
      collection,
      collectionId: 'Memory_users_test',
      subLlm,
      classificationService: classService as any,
      logger: createMockLogger() as any,
    };

    const result = await runClassificationPipeline(deps);
    expect(result.memories_classified).toBe(1);
    expect(classService.classify).toHaveBeenCalledWith(
      'Memory_users_test',
      'mem-1',
      expect.objectContaining({ genre: 'essay' }),
    );
  });

  it('skips already-classified memories', async () => {
    const memories = [createMockMemory('mem-1', 'Already classified')];
    const collection = createMockCollection(memories);
    const classService = createMockClassificationService();
    // Simulate mem-1 already in genres index
    (classService.getOrInitialize as jest.Mock).mockResolvedValue({
      genres: { essay: ['mem-1'] },
      thematic_groups: {},
      quality: {},
      merge_candidates: [],
      last_updated: new Date().toISOString(),
      unclassified_count: 0,
    });

    const deps: ClassificationPipelineDeps = {
      collection,
      collectionId: 'Memory_users_test',
      subLlm: createMockSubLlm(VALID_RESPONSE),
      classificationService: classService as any,
      logger: createMockLogger() as any,
    };

    const result = await runClassificationPipeline(deps);
    expect(result.memories_classified).toBe(0);
  });

  it('handles Haiku parse failures gracefully', async () => {
    const memories = [createMockMemory('mem-1', 'Some content')];
    const collection = createMockCollection(memories);
    const subLlm = createMockSubLlm('not valid json at all');

    const deps: ClassificationPipelineDeps = {
      collection,
      collectionId: 'Memory_users_test',
      subLlm,
      classificationService: createMockClassificationService() as any,
      logger: createMockLogger() as any,
    };

    const result = await runClassificationPipeline(deps);
    expect(result.memories_skipped).toBe(1);
    expect(result.memories_classified).toBe(0);
  });

  it('detects duplicates', async () => {
    const memories = [createMockMemory('mem-1', 'Duplicate content')];
    const collection = createMockCollection(memories);
    const subLlm = createMockSubLlm(JSON.stringify({
      genre: 'essay',
      qualities: ['duplicate'],
      thematic_groups: [],
      is_duplicate: true,
      duplicate_of: 'mem-2',
    }));

    const deps: ClassificationPipelineDeps = {
      collection,
      collectionId: 'Memory_users_test',
      subLlm,
      classificationService: createMockClassificationService() as any,
      logger: createMockLogger() as any,
    };

    const result = await runClassificationPipeline(deps);
    expect(result.duplicates_found).toBe(1);
  });

  it('stores merge candidates', async () => {
    const memories = [createMockMemory('mem-1', 'Some content')];
    const collection = createMockCollection(memories);
    const classService = createMockClassificationService();
    const subLlm = createMockSubLlm(JSON.stringify({
      genre: 'essay',
      qualities: ['substantive'],
      thematic_groups: [],
      merge_candidates: [{ memory_id: 'mem-3', reason: 'covers same topic' }],
    }));

    const deps: ClassificationPipelineDeps = {
      collection,
      collectionId: 'Memory_users_test',
      subLlm,
      classificationService: classService as any,
      logger: createMockLogger() as any,
    };

    const result = await runClassificationPipeline(deps);
    expect(result.merge_candidates_found).toBe(1);
    expect(classService.addMergeCandidate).toHaveBeenCalledWith(
      'Memory_users_test',
      expect.objectContaining({
        memory_id_a: 'mem-1',
        memory_id_b: 'mem-3',
      }),
    );
  });

  it('creates coherence pressure from contradictions', async () => {
    const memories = [createMockMemory('mem-1', 'I hate camping')];
    const collection = createMockCollection(memories);
    const mockMoodService = {
      addPressure: jest.fn().mockResolvedValue(undefined),
      getOrInitialize: jest.fn(),
    };
    const subLlm = createMockSubLlm(JSON.stringify({
      genre: 'journal_entry',
      qualities: ['substantive'],
      thematic_groups: ['camping'],
      contradictions: [{ memory_id: 'mem-5', description: 'loves camping in other memories' }],
    }));

    const deps: ClassificationPipelineDeps = {
      collection,
      collectionId: 'Memory_users_test',
      subLlm,
      classificationService: createMockClassificationService() as any,
      moodService: mockMoodService as any,
      ghostCompositeId: 'ghost-1',
      logger: createMockLogger() as any,
    };

    const result = await runClassificationPipeline(deps);
    expect(result.contradictions_found).toBe(1);
    expect(mockMoodService.addPressure).toHaveBeenCalledWith(
      'test', // extracted from Memory_users_test
      'ghost-1',
      expect.objectContaining({
        dimension: 'coherence',
        magnitude: CONTRADICTION_PRESSURE_MAGNITUDE,
      }),
    );
  });

  it('updates unclassified count after processing', async () => {
    const memories = [
      createMockMemory('mem-1', 'Content 1'),
      createMockMemory('mem-2', 'Content 2'),
    ];
    const collection = createMockCollection(memories);
    collection.aggregate.overAll.mockResolvedValue({ totalCount: 10 });
    const classService = createMockClassificationService();

    const deps: ClassificationPipelineDeps = {
      collection,
      collectionId: 'Memory_users_test',
      subLlm: createMockSubLlm(VALID_RESPONSE),
      classificationService: classService as any,
      logger: createMockLogger() as any,
    };

    await runClassificationPipeline(deps);
    expect(classService.setUnclassifiedCount).toHaveBeenCalledWith(
      'Memory_users_test',
      expect.any(Number),
    );
  });

  it('handles sub-LLM errors gracefully', async () => {
    const memories = [createMockMemory('mem-1', 'Content')];
    const collection = createMockCollection(memories);
    const subLlm = {
      score: jest.fn().mockRejectedValue(new Error('API error')),
    };

    const deps: ClassificationPipelineDeps = {
      collection,
      collectionId: 'Memory_users_test',
      subLlm,
      classificationService: createMockClassificationService() as any,
      logger: createMockLogger() as any,
    };

    const result = await runClassificationPipeline(deps);
    expect(result.memories_skipped).toBe(1);
    expect(result.memories_classified).toBe(0);
  });

  it('respects batch size limit', () => {
    expect(CLASSIFICATION_BATCH_SIZE).toBe(20);
  });

  it('does not create contradiction pressure without moodService', async () => {
    const memories = [createMockMemory('mem-1', 'Content')];
    const collection = createMockCollection(memories);
    const subLlm = createMockSubLlm(JSON.stringify({
      genre: 'essay',
      qualities: ['substantive'],
      thematic_groups: [],
      contradictions: [{ memory_id: 'mem-5', description: 'conflict' }],
    }));

    const deps: ClassificationPipelineDeps = {
      collection,
      collectionId: 'Memory_users_test',
      subLlm,
      classificationService: createMockClassificationService() as any,
      logger: createMockLogger() as any,
      // No moodService
    };

    const result = await runClassificationPipeline(deps);
    expect(result.contradictions_found).toBe(0);
    expect(result.memories_classified).toBe(1);
  });
});
