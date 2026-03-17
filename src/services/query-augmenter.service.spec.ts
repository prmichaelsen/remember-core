/**
 * Tests for QueryAugmenterService
 */

import { QueryAugmenterService } from './query-augmenter.service.js';
import type { SubLlmProvider } from './emotional-scoring.service.js';
import type { Logger } from '../utils/logger.js';

function createMockSubLlm(): SubLlmProvider & { score: jest.Mock } {
  return {
    score: jest.fn(),
  };
}

function createMockLogger(): Logger {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;
}

describe('QueryAugmenterService', () => {
  let service: QueryAugmenterService;
  let mockSubLlm: SubLlmProvider & { score: jest.Mock };
  let mockLogger: Logger;

  beforeEach(() => {
    mockSubLlm = createMockSubLlm();
    mockLogger = createMockLogger();
    service = new QueryAugmenterService(mockSubLlm, mockLogger);
  });

  describe('generateQueries', () => {
    it('should generate queries for valid content', async () => {
      const mockResponse = JSON.stringify([
        'What screenplay did I write?',
        'Where is my script about gardens?',
        'What was that play set in a lost garden?',
      ]);

      mockSubLlm.score.mockResolvedValue(mockResponse);

      const result = await service.generateQueries({
        content: 'The Lost Garden - A screenplay about a forgotten estate...',
        title: 'The Lost Garden',
        content_type: 'screenplay',
      });

      expect(result.success).toBe(true);
      expect(result.queries).toHaveLength(3);
      expect(result.queries[0]).toContain('screenplay');
    });

    it('should skip content that is too short', async () => {
      const result = await service.generateQueries({
        content: 'Short',
      });

      expect(result.success).toBe(true);
      expect(result.queries).toHaveLength(0);
      expect(result.error).toBe('Content too short');
    });

    it('should handle Haiku call failure', async () => {
      mockSubLlm.score.mockRejectedValue(new Error('Haiku timeout'));

      const result = await service.generateQueries({
        content: 'This is a long enough piece of content to trigger query generation...',
      });

      expect(result.success).toBe(false);
      expect(result.queries).toHaveLength(0);
      expect(result.error).toBe('Haiku timeout');
    });

    it('should handle invalid JSON response', async () => {
      mockSubLlm.score.mockResolvedValue('Not valid JSON');

      const result = await service.generateQueries({
        content: 'This is a long enough piece of content to trigger query generation...',
      });

      expect(result.success).toBe(false);
      expect(result.queries).toHaveLength(0);
    });

    it('should extract JSON from markdown code blocks', async () => {
      const mockResponse = `Here are the questions:
\`\`\`json
["What is this about?", "How does this work?"]
\`\`\``;

      mockSubLlm.score.mockResolvedValue(mockResponse);

      const result = await service.generateQueries({
        content: 'This is a long enough piece of content to trigger query generation...',
      });

      expect(result.success).toBe(true);
      expect(result.queries).toHaveLength(2);
    });

    it('should limit queries to max_queries_per_memory', async () => {
      const mockResponse = JSON.stringify([
        'Question 1',
        'Question 2',
        'Question 3',
        'Question 4',
        'Question 5',
        'Question 6',
        'Question 7',
      ]);

      mockSubLlm.score.mockResolvedValue(mockResponse);

      const result = await service.generateQueries({
        content: 'This is a long enough piece of content to trigger query generation...',
      });

      expect(result.success).toBe(true);
      expect(result.queries).toHaveLength(5); // Default max is 5
    });

    it('should filter out non-string or empty queries', async () => {
      const mockResponse = JSON.stringify([
        'Valid question',
        '',
        null,
        'Another valid question',
        '   ',
      ] as any);

      mockSubLlm.score.mockResolvedValue(mockResponse);

      const result = await service.generateQueries({
        content: 'This is a long enough piece of content to trigger query generation...',
      });

      expect(result.success).toBe(true);
      expect(result.queries).toHaveLength(2);
      expect(result.queries).toEqual(['Valid question', 'Another valid question']);
    });
  });

  describe('generateQueriesBatch', () => {
    it('should generate queries for multiple memories', async () => {
      mockSubLlm.score.mockResolvedValue(JSON.stringify(['Question 1']));

      const results = await service.generateQueriesBatch([
        { content: 'Content 1 with enough length to trigger generation...' },
        { content: 'Content 2 with enough length to trigger generation...' },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });
  });

  describe('shouldProcess', () => {
    it('should return true for processable memories', () => {
      expect(
        service.shouldProcess({
          content: 'This is long enough content to be processed for query generation',
          type: 'note',
        }),
      ).toBe(true);
    });

    it('should return false if already generated', () => {
      expect(
        service.shouldProcess({
          content: 'Content',
          queries_generation_status: 'generated',
        }),
      ).toBe(false);
    });

    it('should return false if explicitly skipped', () => {
      expect(
        service.shouldProcess({
          content: 'Content',
          queries_generation_status: 'skipped',
        }),
      ).toBe(false);
    });

    it('should return false if content too short', () => {
      expect(
        service.shouldProcess({
          content: 'Short',
        }),
      ).toBe(false);
    });

    it('should return false for system content types', () => {
      const systemTypes = ['system', 'audit', 'history', 'rem', 'ghost'];

      for (const type of systemTypes) {
        expect(
          service.shouldProcess({
            content: 'This is long enough content to be processed normally',
            type: type as any,
          }),
        ).toBe(false);
      }
    });

    it('should return true for user content types', () => {
      const userTypes = ['note', 'screenplay', 'recipe', 'journal'];

      for (const type of userTypes) {
        expect(
          service.shouldProcess({
            content: 'This is long enough content to be processed normally',
            type: type as any,
          }),
        ).toBe(true);
      }
    });
  });
});
