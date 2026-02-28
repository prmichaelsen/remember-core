// src/clients/http.spec.ts
import { HttpClient } from './http';
import type { HttpClientConfig } from './http';

// Mock global fetch
const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockReset();
});

function mockJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  } as Response;
}

describe('HttpClient', () => {
  describe('URL construction', () => {
    it('constructs correct URL from baseUrl and path', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, { ok: true }));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: async () => 'token',
      });

      await client.request('GET', '/api/svc/v1/health', { userId: 'user1' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/api/svc/v1/health',
        expect.any(Object),
      );
    });

    it('strips trailing slash from baseUrl', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, { ok: true }));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com/',
        getAuthToken: async () => 'token',
      });

      await client.request('GET', '/health', { userId: 'user1' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/health',
        expect.any(Object),
      );
    });
  });

  describe('HTTP method and body', () => {
    it('sends GET request without body', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, {}));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: async () => 'token',
      });

      await client.request('GET', '/health', { userId: 'user1' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('GET');
      expect(options.body).toBeUndefined();
    });

    it('sends POST request with JSON body', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, { id: '123' }));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: async () => 'token',
      });

      await client.request('POST', '/api/svc/v1/memories', {
        userId: 'user1',
        body: { content: 'hello', content_type: 'note' },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ content: 'hello', content_type: 'note' });
    });

    it('sends PATCH request', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, {}));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: async () => 'token',
      });

      await client.request('PATCH', '/api/svc/v1/memories/123', {
        userId: 'user1',
        body: { content: 'updated' },
      });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PATCH');
    });

    it('sends DELETE request', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, {}));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: async () => 'token',
      });

      await client.request('DELETE', '/api/svc/v1/memories/123', { userId: 'user1' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('DELETE');
    });
  });

  describe('auth: getAuthToken', () => {
    it('attaches Bearer token from getAuthToken callback', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, {}));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: async (userId) => `token-for-${userId}`,
      });

      await client.request('GET', '/health', { userId: 'user1' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer token-for-user1');
    });

    it('supports sync getAuthToken', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, {}));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: (userId) => `sync-token-${userId}`,
      });

      await client.request('GET', '/health', { userId: 'user1' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer sync-token-user1');
    });
  });

  describe('auth: no auth configured', () => {
    it('returns auth_error when no auth provided and userId given', async () => {
      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
      });

      const result = await client.request('GET', '/health', { userId: 'user1' });
      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('auth_error');
      expect(result.error?.message).toContain('No auth configured');
    });
  });

  describe('auth: no userId', () => {
    it('skips auth header when no userId provided', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, { status: 'ok' }));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
      });

      await client.request('GET', '/health');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });
  });

  describe('response handling', () => {
    it('returns SdkResponse with data on success', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, { id: '123' }));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: async () => 'token',
      });

      const result = await client.request<{ id: string }>('GET', '/test', { userId: 'user1' });
      expect(result.data).toEqual({ id: '123' });
      expect(result.error).toBeNull();
    });

    it('returns SdkResponse with error on failure', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(404, { message: 'Not found' }));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: async () => 'token',
      });

      const result = await client.request('GET', '/test', { userId: 'user1' });
      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('not_found');
    });

    it('returns network_error on fetch failure', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: async () => 'token',
      });

      const result = await client.request('GET', '/test', { userId: 'user1' });
      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('network_error');
      expect(result.error?.message).toContain('Connection refused');
    });
  });

  describe('headers', () => {
    it('sets Content-Type to application/json', async () => {
      mockFetch.mockResolvedValue(mockJsonResponse(200, {}));

      const client = new HttpClient({
        baseUrl: 'https://api.example.com',
        getAuthToken: async () => 'token',
      });

      await client.request('POST', '/test', { userId: 'user1', body: {} });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
    });
  });
});
