import {
  buildEditorialPrompt,
  parseEditorialResponse,
  EditorialScoringService,
  MAX_CONTENT_LENGTH,
  DEFAULT_BATCH_LIMIT,
  type EditorialMemory,
} from './editorial-scoring.service.js';

// ── buildEditorialPrompt ──

describe('buildEditorialPrompt', () => {
  it('includes memory content in the prompt', () => {
    const prompt = buildEditorialPrompt('Hello world');
    expect(prompt).toContain('Hello world');
    expect(prompt).toContain('Evaluate this memory');
    expect(prompt).toContain('JSON');
  });

  it('truncates content exceeding MAX_CONTENT_LENGTH', () => {
    const long = 'x'.repeat(MAX_CONTENT_LENGTH + 100);
    const prompt = buildEditorialPrompt(long);
    expect(prompt).toContain('x'.repeat(MAX_CONTENT_LENGTH) + '...');
    expect(prompt).not.toContain('x'.repeat(MAX_CONTENT_LENGTH + 1));
  });

  it('does not truncate content at exactly MAX_CONTENT_LENGTH', () => {
    const exact = 'y'.repeat(MAX_CONTENT_LENGTH);
    const prompt = buildEditorialPrompt(exact);
    expect(prompt).toContain(exact);
    expect(prompt).not.toContain('...');
  });
});

// ── parseEditorialResponse ──

describe('parseEditorialResponse', () => {
  it('parses valid JSON response', () => {
    const result = parseEditorialResponse('{"score": 0.85, "reason": "well written"}');
    expect(result.score).toBe(0.85);
    expect(result.reason).toBe('well written');
  });

  it('extracts JSON embedded in text', () => {
    const result = parseEditorialResponse(
      'Here is my evaluation: {"score": 0.7, "reason": "good content"} end',
    );
    expect(result.score).toBe(0.7);
    expect(result.reason).toBe('good content');
  });

  it('falls back to bare number extraction', () => {
    const result = parseEditorialResponse('I rate this 0.65 out of 1.0');
    expect(result.score).toBe(0.65);
    expect(result.reason).toBe('extracted_number');
  });

  it('returns 0.5 fallback for unparseable response', () => {
    const result = parseEditorialResponse('no score here');
    expect(result.score).toBe(0.5);
    expect(result.reason).toBe('parse_fallback');
  });

  it('returns 0.5 fallback for out-of-range score', () => {
    const result = parseEditorialResponse('{"score": 2.5, "reason": "too high"}');
    expect(result.score).toBe(0.5);
    expect(result.reason).toBe('parse_fallback');
  });

  it('returns 0.5 for negative score (falls through to number extraction)', () => {
    const result = parseEditorialResponse('{"score": -0.5, "reason": "negative"}');
    expect(result.score).toBe(0.5);
    expect(result.reason).toBe('extracted_number');
  });

  it('handles score of exactly 0', () => {
    const result = parseEditorialResponse('{"score": 0, "reason": "terrible"}');
    expect(result.score).toBe(0);
    expect(result.reason).toBe('terrible');
  });

  it('handles score of exactly 1', () => {
    const result = parseEditorialResponse('{"score": 1.0, "reason": "perfect"}');
    expect(result.score).toBe(1.0);
    expect(result.reason).toBe('perfect');
  });

  it('handles missing reason field', () => {
    const result = parseEditorialResponse('{"score": 0.6}');
    expect(result.score).toBe(0.6);
    expect(result.reason).toBe('');
  });
});

// ── EditorialScoringService ──

describe('EditorialScoringService', () => {
  const mockSubLlm = { score: jest.fn() };
  const mockLogger = { info: jest.fn(), warn: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluate', () => {
    it('calls subLlm and parses the response', async () => {
      mockSubLlm.score.mockResolvedValue('{"score": 0.8, "reason": "clear and concise"}');
      const service = new EditorialScoringService({ subLlm: mockSubLlm });

      const result = await service.evaluate('My important memory');

      expect(mockSubLlm.score).toHaveBeenCalledTimes(1);
      expect(mockSubLlm.score).toHaveBeenCalledWith(expect.stringContaining('My important memory'));
      expect(result.score).toBe(0.8);
      expect(result.reason).toBe('clear and concise');
    });
  });

  describe('evaluateBatch', () => {
    it('skips memories already scored (editorial_score > 0)', async () => {
      mockSubLlm.score.mockResolvedValue('{"score": 0.7, "reason": "ok"}');
      const service = new EditorialScoringService({ subLlm: mockSubLlm, logger: mockLogger });

      const memories: EditorialMemory[] = [
        { id: 'a', content: 'new memory', editorial_score: 0 },
        { id: 'b', content: 'already scored', editorial_score: 0.9 },
        { id: 'c', content: 'also new', editorial_score: undefined },
      ];

      const result = await service.evaluateBatch(memories);

      expect(result.evaluated).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.results).toHaveLength(2);
      expect(result.results.map((r) => r.memory_id)).toEqual(['a', 'c']);
    });

    it('respects batchLimit', async () => {
      mockSubLlm.score.mockResolvedValue('{"score": 0.5, "reason": "avg"}');
      const service = new EditorialScoringService({ subLlm: mockSubLlm });

      const memories: EditorialMemory[] = Array.from({ length: 10 }, (_, i) => ({
        id: `m${i}`,
        content: `memory ${i}`,
        editorial_score: 0,
      }));

      const result = await service.evaluateBatch(memories, 3);

      expect(result.evaluated).toBe(3);
      expect(mockSubLlm.score).toHaveBeenCalledTimes(3);
    });

    it('handles evaluation errors gracefully', async () => {
      mockSubLlm.score
        .mockResolvedValueOnce('{"score": 0.8, "reason": "good"}')
        .mockRejectedValueOnce(new Error('LLM timeout'))
        .mockResolvedValueOnce('{"score": 0.6, "reason": "ok"}');

      const service = new EditorialScoringService({ subLlm: mockSubLlm, logger: mockLogger });

      const memories: EditorialMemory[] = [
        { id: 'a', content: 'first' },
        { id: 'b', content: 'second' },
        { id: 'c', content: 'third' },
      ];

      const result = await service.evaluateBatch(memories);

      expect(result.evaluated).toBe(3);
      expect(result.results[0]).toEqual({ memory_id: 'a', score: 0.8, reason: 'good' });
      expect(result.results[1]).toEqual({ memory_id: 'b', score: 0.5, reason: 'evaluation_error' });
      expect(result.results[2]).toEqual({ memory_id: 'c', score: 0.6, reason: 'ok' });
      expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    });

    it('uses DEFAULT_BATCH_LIMIT when no limit specified', async () => {
      expect(DEFAULT_BATCH_LIMIT).toBe(16000);
    });

    it('returns empty results for all-scored memories', async () => {
      const service = new EditorialScoringService({ subLlm: mockSubLlm });

      const memories: EditorialMemory[] = [
        { id: 'a', content: 'scored', editorial_score: 0.5 },
        { id: 'b', content: 'also scored', editorial_score: 0.8 },
      ];

      const result = await service.evaluateBatch(memories);

      expect(result.evaluated).toBe(0);
      expect(result.skipped).toBe(2);
      expect(result.results).toHaveLength(0);
      expect(mockSubLlm.score).not.toHaveBeenCalled();
    });
  });
});
