import { ClassificationService, GENRES, QUALITY_SIGNALS } from './classification.service.js';
import type { ClassificationIndex } from './classification.service.js';

jest.mock('../database/firestore/init.js', () => ({
  getDocument: jest.fn(),
  setDocument: jest.fn(),
  updateDocument: jest.fn(),
}));

jest.mock('../database/firestore/paths.js', () => ({
  getClassificationPath: jest.fn((collectionId: string) => ({
    collectionPath: `test.collections/${collectionId}/core`,
    docId: 'classifications',
  })),
}));

import { getDocument, setDocument, updateDocument } from '../database/firestore/init.js';

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;
const mockUpdateDocument = updateDocument as jest.MockedFunction<typeof updateDocument>;

function emptyIndex(): ClassificationIndex {
  return {
    genres: {},
    thematic_groups: {},
    quality: {},
    merge_candidates: [],
    last_updated: '2026-03-07T00:00:00.000Z',
    unclassified_count: 0,
  };
}

describe('ClassificationService', () => {
  let service: ClassificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ClassificationService();
  });

  describe('getClassifications', () => {
    it('returns null when not found', async () => {
      mockGetDocument.mockResolvedValue(null);
      const result = await service.getClassifications('col1');
      expect(result).toBeNull();
    });

    it('returns index when found', async () => {
      const index = emptyIndex();
      mockGetDocument.mockResolvedValue(index as any);
      const result = await service.getClassifications('col1');
      expect(result).toEqual(index);
    });
  });

  describe('getByGenre', () => {
    it('returns memory ids for a genre', async () => {
      const index = emptyIndex();
      index.genres.short_story = ['m1', 'm2'];
      mockGetDocument.mockResolvedValue(index as any);
      const result = await service.getByGenre('col1', 'short_story');
      expect(result).toEqual(['m1', 'm2']);
    });

    it('returns empty array for unknown genre', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      const result = await service.getByGenre('col1', 'poem');
      expect(result).toEqual([]);
    });

    it('returns empty array when index not found', async () => {
      mockGetDocument.mockResolvedValue(null);
      const result = await service.getByGenre('col1', 'essay');
      expect(result).toEqual([]);
    });
  });

  describe('getByQuality', () => {
    it('returns memory ids for substantive', async () => {
      const index = emptyIndex();
      index.quality.substantive = ['m1'];
      mockGetDocument.mockResolvedValue(index as any);
      expect(await service.getByQuality('col1', 'substantive')).toEqual(['m1']);
    });

    it('returns memory ids for draft', async () => {
      const index = emptyIndex();
      index.quality.draft = ['m2'];
      mockGetDocument.mockResolvedValue(index as any);
      expect(await service.getByQuality('col1', 'draft')).toEqual(['m2']);
    });

    it('returns memory ids for low_value', async () => {
      const index = emptyIndex();
      index.quality.low_value = ['m3', 'm4'];
      mockGetDocument.mockResolvedValue(index as any);
      expect(await service.getByQuality('col1', 'low_value')).toEqual(['m3', 'm4']);
    });

    it('returns memory ids for duplicate', async () => {
      const index = emptyIndex();
      index.quality.duplicate = ['m5'];
      mockGetDocument.mockResolvedValue(index as any);
      expect(await service.getByQuality('col1', 'duplicate')).toEqual(['m5']);
    });

    it('returns memory ids for stale', async () => {
      const index = emptyIndex();
      index.quality.stale = ['m6'];
      mockGetDocument.mockResolvedValue(index as any);
      expect(await service.getByQuality('col1', 'stale')).toEqual(['m6']);
    });

    it('returns empty for quality with no memories', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      const result = await service.getByQuality('col1', 'duplicate');
      expect(result).toEqual([]);
    });
  });

  describe('getByThematicGroup', () => {
    it('returns memory ids for a group', async () => {
      const index = emptyIndex();
      index.thematic_groups.music_production = ['m5'];
      mockGetDocument.mockResolvedValue(index as any);
      const result = await service.getByThematicGroup('col1', 'music_production');
      expect(result).toEqual(['m5']);
    });

    it('normalizes group name to snake_case', async () => {
      const index = emptyIndex();
      index.thematic_groups.ai_architecture = ['m6'];
      mockGetDocument.mockResolvedValue(index as any);
      const result = await service.getByThematicGroup('col1', 'ai-architecture');
      expect(result).toEqual(['m6']);
    });
  });

  describe('getUnclassifiedCount', () => {
    it('returns count from index', async () => {
      const index = emptyIndex();
      index.unclassified_count = 42;
      mockGetDocument.mockResolvedValue(index as any);
      expect(await service.getUnclassifiedCount('col1')).toBe(42);
    });

    it('returns 0 when index not found', async () => {
      mockGetDocument.mockResolvedValue(null);
      expect(await service.getUnclassifiedCount('col1')).toBe(0);
    });
  });

  describe('getMergeCandidates', () => {
    it('returns merge candidates', async () => {
      const index = emptyIndex();
      index.merge_candidates = [{ memory_id_a: 'm1', memory_id_b: 'm2', reason: 'similar' }];
      mockGetDocument.mockResolvedValue(index as any);
      const result = await service.getMergeCandidates('col1');
      expect(result).toHaveLength(1);
      expect(result[0].reason).toBe('similar');
    });

    it('returns empty when index not found', async () => {
      mockGetDocument.mockResolvedValue(null);
      expect(await service.getMergeCandidates('col1')).toEqual([]);
    });
  });

  describe('classify', () => {
    it('adds memory to genre', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      await service.classify('col1', 'm1', { genre: 'poem' });
      expect(mockSetDocument).toHaveBeenCalled();
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.genres.poem).toEqual(['m1']);
    });

    it('adds memory to multiple quality signals', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      await service.classify('col1', 'm1', { qualities: ['draft', 'low_value'] });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.quality.draft).toEqual(['m1']);
      expect(saved.quality.low_value).toEqual(['m1']);
    });

    it('adds memory to multiple thematic groups', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      await service.classify('col1', 'm1', {
        thematic_groups: ['music-production', 'AI Architecture'],
      });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.thematic_groups.music_production).toEqual(['m1']);
      expect(saved.thematic_groups.ai_architecture).toEqual(['m1']);
    });

    it('does not duplicate memory in same genre', async () => {
      const index = emptyIndex();
      index.genres.poem = ['m1'];
      mockGetDocument.mockResolvedValue(index as any);
      await service.classify('col1', 'm1', { genre: 'poem' });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.genres.poem).toEqual(['m1']);
    });

    it('can classify with genre only', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      await service.classify('col1', 'm1', { genre: 'essay' });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.genres.essay).toEqual(['m1']);
      expect(Object.keys(saved.quality)).toHaveLength(0);
    });

    it('can classify with qualities only', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      await service.classify('col1', 'm1', { qualities: ['substantive'] });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.quality.substantive).toEqual(['m1']);
    });

    it('can classify with thematic_groups only', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      await service.classify('col1', 'm1', { thematic_groups: ['deep_learning'] });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.thematic_groups.deep_learning).toEqual(['m1']);
    });

    it('can classify with all three at once', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      await service.classify('col1', 'm1', {
        genre: 'technical_note',
        qualities: ['substantive', 'draft'],
        thematic_groups: ['api_design'],
      });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.genres.technical_note).toEqual(['m1']);
      expect(saved.quality.substantive).toEqual(['m1']);
      expect(saved.quality.draft).toEqual(['m1']);
      expect(saved.thematic_groups.api_design).toEqual(['m1']);
    });

    it('rejects invalid genre', async () => {
      await expect(
        service.classify('col1', 'm1', { genre: 'invalid' as any }),
      ).rejects.toThrow('Invalid genre: invalid');
    });

    it('rejects invalid quality signal', async () => {
      await expect(
        service.classify('col1', 'm1', { qualities: ['bad' as any] }),
      ).rejects.toThrow('Invalid quality signal: bad');
    });

    it('initializes index if not found', async () => {
      mockGetDocument.mockResolvedValue(null);
      await service.classify('col1', 'm1', { genre: 'essay' });
      // setDocument called twice: once for init, once for classify
      expect(mockSetDocument).toHaveBeenCalledTimes(2);
    });

    it('updates last_updated', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      const before = new Date().toISOString();
      await service.classify('col1', 'm1', { genre: 'rant' });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.last_updated >= before).toBe(true);
    });
  });

  describe('addMergeCandidate', () => {
    it('adds a merge candidate', async () => {
      mockGetDocument.mockResolvedValue(emptyIndex() as any);
      await service.addMergeCandidate('col1', {
        memory_id_a: 'm1',
        memory_id_b: 'm2',
        reason: 'similar checklists',
      });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.merge_candidates).toHaveLength(1);
      expect(saved.merge_candidates[0].reason).toBe('similar checklists');
    });

    it('deduplicates same pair', async () => {
      const index = emptyIndex();
      index.merge_candidates = [{ memory_id_a: 'm1', memory_id_b: 'm2', reason: 'first' }];
      mockGetDocument.mockResolvedValue(index as any);
      await service.addMergeCandidate('col1', {
        memory_id_a: 'm1',
        memory_id_b: 'm2',
        reason: 'duplicate',
      });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.merge_candidates).toHaveLength(1);
    });

    it('deduplicates reverse direction', async () => {
      const index = emptyIndex();
      index.merge_candidates = [{ memory_id_a: 'm1', memory_id_b: 'm2', reason: 'first' }];
      mockGetDocument.mockResolvedValue(index as any);
      await service.addMergeCandidate('col1', {
        memory_id_a: 'm2',
        memory_id_b: 'm1',
        reason: 'reverse',
      });
      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.merge_candidates).toHaveLength(1);
    });
  });

  describe('removeFromIndex', () => {
    it('removes memory from all categories', async () => {
      const index = emptyIndex();
      index.genres.poem = ['m1', 'm2'];
      index.quality.draft = ['m1'];
      index.thematic_groups.music = ['m1', 'm3'];
      index.merge_candidates = [
        { memory_id_a: 'm1', memory_id_b: 'm4', reason: 'test' },
        { memory_id_a: 'm5', memory_id_b: 'm6', reason: 'other' },
      ];
      mockGetDocument.mockResolvedValue(index as any);

      await service.removeFromIndex('col1', 'm1');

      const saved = mockSetDocument.mock.calls[0][2] as unknown as ClassificationIndex;
      expect(saved.genres.poem).toEqual(['m2']);
      expect(saved.quality.draft).toEqual([]);
      expect(saved.thematic_groups.music).toEqual(['m3']);
      expect(saved.merge_candidates).toHaveLength(1);
      expect(saved.merge_candidates[0].memory_id_a).toBe('m5');
    });

    it('does nothing when index not found', async () => {
      mockGetDocument.mockResolvedValue(null);
      await service.removeFromIndex('col1', 'm1');
      expect(mockSetDocument).not.toHaveBeenCalled();
    });
  });

  describe('initializeIndex', () => {
    it('creates empty index', async () => {
      const result = await service.initializeIndex('col1');
      expect(result.genres).toEqual({});
      expect(result.quality).toEqual({});
      expect(result.thematic_groups).toEqual({});
      expect(result.merge_candidates).toEqual([]);
      expect(result.unclassified_count).toBe(0);
      expect(mockSetDocument).toHaveBeenCalled();
    });
  });

  describe('getOrInitialize', () => {
    it('returns existing index', async () => {
      const index = emptyIndex();
      index.unclassified_count = 5;
      mockGetDocument.mockResolvedValue(index as any);
      const result = await service.getOrInitialize('col1');
      expect(result.unclassified_count).toBe(5);
      expect(mockSetDocument).not.toHaveBeenCalled();
    });

    it('creates new index when not found', async () => {
      mockGetDocument.mockResolvedValue(null);
      const result = await service.getOrInitialize('col1');
      expect(result.genres).toEqual({});
      expect(mockSetDocument).toHaveBeenCalled();
    });
  });

  describe('setUnclassifiedCount', () => {
    it('updates count via updateDocument', async () => {
      await service.setUnclassifiedCount('col1', 15);
      expect(mockUpdateDocument).toHaveBeenCalledWith(
        'test.collections/col1/core',
        'classifications',
        expect.objectContaining({ unclassified_count: 15 }),
      );
    });
  });

  describe('type constants', () => {
    it('has 18 genres', () => {
      expect(GENRES).toHaveLength(18);
    });

    it('has 5 quality signals', () => {
      expect(QUALITY_SIGNALS).toHaveLength(5);
    });
  });
});
