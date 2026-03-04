import { ImportService, chunkByTokens, estimateTokens } from './import.service.js';
import type { MemoryService } from './memory.service.js';
import type { RelationshipService } from './relationship.service.js';
import type { HaikuClient } from './rem.haiku.js';
import type { Logger } from '../utils/logger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────

function createMockMemoryService(): jest.Mocked<Pick<MemoryService, 'create'>> {
  let counter = 0;
  return {
    create: jest.fn().mockImplementation(() => {
      counter++;
      return Promise.resolve({
        memory_id: `mem-${counter}`,
        created_at: new Date().toISOString(),
      });
    }),
  };
}

function createMockRelationshipService(): jest.Mocked<Pick<RelationshipService, 'create'>> {
  let counter = 0;
  return {
    create: jest.fn().mockImplementation((input) => {
      counter++;
      return Promise.resolve({
        relationship_id: `rel-${counter}`,
        memory_ids: input.memory_ids,
        created_at: new Date().toISOString(),
      });
    }),
  };
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

// ─── estimateTokens ──────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns ceil(length / 4) for English text', () => {
    expect(estimateTokens('hello')).toBe(2); // 5/4 = 1.25 → 2
    expect(estimateTokens('hi')).toBe(1);    // 2/4 = 0.5 → 1
    expect(estimateTokens('')).toBe(0);
  });

  it('handles longer text', () => {
    const text = 'a'.repeat(12000);
    expect(estimateTokens(text)).toBe(3000);
  });
});

// ─── chunkByTokens ───────────────────────────────────────────────────────

describe('chunkByTokens', () => {
  it('returns empty array for empty input', () => {
    expect(chunkByTokens('', 3000)).toEqual([]);
    expect(chunkByTokens('   ', 3000)).toEqual([]);
  });

  it('returns single chunk when text fits within budget', () => {
    const text = 'Short paragraph.';
    const chunks = chunkByTokens(text, 3000);
    expect(chunks).toEqual(['Short paragraph.']);
  });

  it('splits on paragraph boundaries', () => {
    // Each paragraph ~10 tokens (40 chars), budget = 15 tokens
    const p1 = 'a'.repeat(40);
    const p2 = 'b'.repeat(40);
    const p3 = 'c'.repeat(40);
    const text = `${p1}\n\n${p2}\n\n${p3}`;

    const chunks = chunkByTokens(text, 15);
    expect(chunks.length).toBe(3);
    expect(chunks[0]).toBe(p1);
    expect(chunks[1]).toBe(p2);
    expect(chunks[2]).toBe(p3);
  });

  it('consolidates small paragraphs within budget', () => {
    // Each paragraph ~5 tokens (20 chars), budget = 15 tokens (fits 2-3)
    const p1 = 'a'.repeat(20);
    const p2 = 'b'.repeat(20);
    const p3 = 'c'.repeat(20);
    const text = `${p1}\n\n${p2}\n\n${p3}`;

    const chunks = chunkByTokens(text, 15);
    // p1+p2 = 10 tokens, fits. Adding p3 = 15, still fits.
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain(p1);
    expect(chunks[0]).toContain(p2);
    expect(chunks[0]).toContain(p3);
  });

  it('emits oversized single paragraph as-is', () => {
    const huge = 'x'.repeat(20000); // ~5000 tokens, budget = 3000
    const chunks = chunkByTokens(huge, 3000);
    // Falls back to char split since single paragraph
    expect(chunks.length).toBe(2);
    expect(chunks[0].length).toBe(12000); // 3000 * 4
    expect(chunks[1].length).toBe(8000);
  });

  it('falls back to char split when no paragraph breaks', () => {
    const text = 'x'.repeat(24000); // ~6000 tokens, no \n\n
    const chunks = chunkByTokens(text, 3000);
    expect(chunks.length).toBe(2);
  });

  it('handles multiple consecutive paragraph breaks', () => {
    const text = 'paragraph one\n\n\n\nparagraph two';
    const chunks = chunkByTokens(text, 3000);
    expect(chunks.length).toBe(1);
    expect(chunks[0]).toContain('paragraph one');
    expect(chunks[0]).toContain('paragraph two');
  });
});

// ─── ImportService ───────────────────────────────────────────────────────

describe('ImportService', () => {
  let service: ImportService;
  let mockMemory: jest.Mocked<Pick<MemoryService, 'create'>>;
  let mockRelationship: jest.Mocked<Pick<RelationshipService, 'create'>>;
  let mockHaiku: jest.Mocked<HaikuClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockMemory = createMockMemoryService();
    mockRelationship = createMockRelationshipService();
    mockHaiku = createMockHaikuClient();
    mockLogger = createMockLogger();

    service = new ImportService(
      mockMemory as unknown as MemoryService,
      mockRelationship as unknown as RelationshipService,
      mockHaiku,
      mockLogger,
    );
  });

  describe('single item, single chunk', () => {
    it('creates 1 chunk + 1 parent + 1 relationship', async () => {
      const result = await service.import({
        items: [{ content: 'Short text that fits in one chunk.' }],
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].chunk_count).toBe(1);
      expect(result.items[0].chunk_memory_ids).toHaveLength(1);
      expect(result.total_memories_created).toBe(2); // 1 chunk + 1 parent

      // 2 create calls: 1 chunk + 1 parent
      expect(mockMemory.create).toHaveBeenCalledTimes(2);

      // 1 relationship: chunk → parent
      expect(mockRelationship.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('single item, multiple chunks', () => {
    it('creates N chunks + 1 parent + N relationships', async () => {
      // Create text that will split into 3 chunks at 10 tokens each
      const p1 = 'a'.repeat(40);
      const p2 = 'b'.repeat(40);
      const p3 = 'c'.repeat(40);
      const content = `${p1}\n\n${p2}\n\n${p3}`;

      const result = await service.import({
        items: [{ content }],
        chunk_size: 15, // 15 tokens → each paragraph gets its own chunk
      });

      expect(result.items[0].chunk_count).toBe(3);
      expect(result.total_memories_created).toBe(4); // 3 chunks + 1 parent

      // 4 create calls: 3 chunks + 1 parent
      expect(mockMemory.create).toHaveBeenCalledTimes(4);

      // 3 relationships
      expect(mockRelationship.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('multiple items', () => {
    it('processes each item independently', async () => {
      const result = await service.import({
        items: [
          { content: 'Item one text.', source_filename: 'file1.txt' },
          { content: 'Item two text.', source_filename: 'file2.txt' },
        ],
      });

      expect(result.items).toHaveLength(2);
      expect(result.items[0].source_filename).toBe('file1.txt');
      expect(result.items[1].source_filename).toBe('file2.txt');

      // Each item: 1 chunk + 1 parent = 2 memories, total 4
      expect(result.total_memories_created).toBe(4);
    });
  });

  describe('chunk markers and tags', () => {
    it('adds [CHUNK 00001] marker to chunk content', async () => {
      await service.import({
        items: [{ content: 'Some content.' }],
      });

      const chunkCall = mockMemory.create.mock.calls[0][0];
      expect(chunkCall.content).toMatch(/^\[CHUNK 00001\]\n\n/);
    });

    it('tags chunks with import:{uuid}', async () => {
      await service.import({
        items: [{ content: 'Some content.' }],
      });

      const chunkCall = mockMemory.create.mock.calls[0][0];
      expect(chunkCall.tags).toHaveLength(1);
      expect(chunkCall.tags![0]).toMatch(/^import:[0-9a-f-]+$/);
    });

    it('tags parent with import:{uuid} and import_summary', async () => {
      await service.import({
        items: [{ content: 'Some content.' }],
      });

      // Parent is the 2nd create call (after chunk)
      const parentCall = mockMemory.create.mock.calls[1][0];
      expect(parentCall.tags).toContain('import_summary');
      expect(parentCall.tags!.some((t: string) => t.startsWith('import:'))).toBe(true);
    });
  });

  describe('relationships', () => {
    it('creates part_of relationships with source=rule', async () => {
      await service.import({
        items: [{ content: 'Some content.' }],
      });

      const relCall = mockRelationship.create.mock.calls[0][0];
      expect(relCall.relationship_type).toBe('part_of');
      expect(relCall.source).toBe('rule');
      expect(relCall.memory_ids).toHaveLength(2);
    });
  });

  describe('HaikuClient summary', () => {
    it('uses extractFeatures summary for parent content', async () => {
      const result = await service.import({
        items: [{ content: 'Some content.' }],
      });

      expect(result.items[0].summary).toBe('A test document about various topics.');
      expect(mockHaiku.extractFeatures).toHaveBeenCalledTimes(1);
    });

    it('falls back to default summary on HaikuClient failure', async () => {
      mockHaiku.extractFeatures.mockRejectedValue(new Error('API error'));

      const result = await service.import({
        items: [{ content: 'Some content.' }],
      });

      expect(result.items[0].summary).toBe('Imported 1 chunks from pasted text');
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('context_conversation_id', () => {
    it('passes conversation ID to memory creates', async () => {
      await service.import({
        items: [{ content: 'Content.' }],
        context_conversation_id: 'conv-123',
      });

      for (const call of mockMemory.create.mock.calls) {
        expect(call[0].context_conversation_id).toBe('conv-123');
      }
    });
  });
});
