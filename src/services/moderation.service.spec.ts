import {
  createModerationClient,
  createMockModerationClient,
  type ModerationResult,
} from './moderation.service.js';

// ─── Helpers ─────────────────────────────────────────────────────────────

function mockFetchResponse(body: any, status = 200) {
  return jest.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      content: [{ type: 'text', text: JSON.stringify(body) }],
    }),
  });
}

function mockFetchText(text: string, status = 200) {
  return jest.fn().mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({
      content: [{ type: 'text', text }],
    }),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('ModerationService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('createModerationClient', () => {
    it('returns pass for allowed content', async () => {
      global.fetch = mockFetchResponse({ pass: true }) as any;
      const client = createModerationClient({ apiKey: 'test-key' });

      const result = await client.moderate('I love hiking in the mountains');

      expect(result.pass).toBe(true);
      expect(result.reason).toBe('');
      expect(result.category).toBeUndefined();
    });

    it('returns fail with reason and category for blocked content', async () => {
      global.fetch = mockFetchResponse({
        pass: false,
        reason: 'Contains explicit dehumanization targeting an ethnic group',
        category: 'hate_speech',
      }) as any;
      const client = createModerationClient({ apiKey: 'test-key' });

      const result = await client.moderate('hateful content');

      expect(result.pass).toBe(false);
      expect(result.reason).toBe('Contains explicit dehumanization targeting an ethnic group');
      expect(result.category).toBe('hate_speech');
    });

    it('fails closed on non-200 API response', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      }) as any;
      const client = createModerationClient({ apiKey: 'test-key' });

      const result = await client.moderate('any content');

      expect(result.pass).toBe(false);
      expect(result.reason).toContain('unavailable');
    });

    it('fails closed on network error', async () => {
      global.fetch = jest.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')) as any;
      const client = createModerationClient({ apiKey: 'test-key' });

      const result = await client.moderate('any content');

      expect(result.pass).toBe(false);
      expect(result.reason).toContain('unavailable');
    });

    it('fails closed on invalid JSON response', async () => {
      global.fetch = mockFetchText('not valid json') as any;
      const client = createModerationClient({ apiKey: 'test-key' });

      const result = await client.moderate('any content');

      expect(result.pass).toBe(false);
      expect(result.reason).toContain('unavailable');
    });

    it('uses correct model and API parameters', async () => {
      global.fetch = mockFetchResponse({ pass: true }) as any;
      const client = createModerationClient({ apiKey: 'my-key', model: 'custom-model' });

      await client.moderate('test');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'my-key',
            'anthropic-version': '2023-06-01',
          }),
        }),
      );

      const callBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
      expect(callBody.model).toBe('custom-model');
      expect(callBody.max_tokens).toBe(256);
    });
  });

  describe('cache', () => {
    it('returns cached result for identical content', async () => {
      global.fetch = mockFetchResponse({ pass: true }) as any;
      const client = createModerationClient({ apiKey: 'test-key' });

      const result1 = await client.moderate('same content');
      const result2 = await client.moderate('same content');

      expect(result1).toEqual(result2);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('makes separate calls for different content', async () => {
      const fetchMock = jest.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: [{ type: 'text', text: '{"pass":true}' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: [{ type: 'text', text: '{"pass":true}' }] }),
        });
      global.fetch = fetchMock as any;
      const client = createModerationClient({ apiKey: 'test-key' });

      await client.moderate('content A');
      await client.moderate('content B');

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('evicts oldest entry when cache is full', async () => {
      let callCount = 0;
      global.fetch = jest.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({ content: [{ type: 'text', text: '{"pass":true}' }] }),
        };
      }) as any;

      const client = createModerationClient({ apiKey: 'test-key', cacheMax: 3 });

      // Fill cache with 3 entries
      await client.moderate('content-1');
      await client.moderate('content-2');
      await client.moderate('content-3');
      expect(callCount).toBe(3);

      // content-1 should be cached
      await client.moderate('content-1');
      expect(callCount).toBe(3); // no new call

      // Add content-4 — should evict content-1 (oldest)
      await client.moderate('content-4');
      expect(callCount).toBe(4);

      // content-1 was evicted — should trigger new API call
      await client.moderate('content-1');
      expect(callCount).toBe(5);

      // content-3 should still be cached (wasn't evicted)
      await client.moderate('content-3');
      expect(callCount).toBe(5);
    });
  });

  describe('createMockModerationClient', () => {
    it('returns pass by default', async () => {
      const client = createMockModerationClient();
      const result = await client.moderate('anything');
      expect(result.pass).toBe(true);
    });

    it('returns custom result when provided', async () => {
      const custom: ModerationResult = {
        pass: false,
        reason: 'test reason',
        category: 'hate_speech',
      };
      const client = createMockModerationClient(custom);
      const result = await client.moderate('anything');
      expect(result).toEqual(custom);
    });
  });
});
