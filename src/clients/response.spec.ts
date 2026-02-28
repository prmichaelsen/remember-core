// src/clients/response.spec.ts
import { createSuccess, createError, fromHttpResponse } from './response';
import type { RememberError, SdkResponse } from './response';

describe('SdkResponse', () => {
  describe('createSuccess', () => {
    it('returns data and null error', () => {
      const result = createSuccess({ id: '123', name: 'test' });
      expect(result.data).toEqual({ id: '123', name: 'test' });
      expect(result.error).toBeNull();
    });

    it('throwOnError returns data', () => {
      const result = createSuccess({ id: '123' });
      expect(result.throwOnError()).toEqual({ id: '123' });
    });
  });

  describe('createError', () => {
    it('returns null data and error', () => {
      const error: RememberError = {
        code: 'not_found',
        message: 'Memory not found',
        status: 404,
      };
      const result = createError(error);
      expect(result.data).toBeNull();
      expect(result.error).toEqual(error);
    });

    it('throwOnError throws the error', () => {
      const error: RememberError = {
        code: 'not_found',
        message: 'Memory not found',
        status: 404,
      };
      const result = createError(error);
      expect(() => result.throwOnError()).toThrow();
      try {
        result.throwOnError();
      } catch (e) {
        expect(e).toBe(error);
        expect((e as RememberError).code).toBe('not_found');
        expect((e as RememberError).status).toBe(404);
      }
    });

    it('includes context when present', () => {
      const error: RememberError = {
        code: 'validation',
        message: 'Invalid input',
        status: 422,
        context: { field: 'content', reason: 'required' },
      };
      const result = createError(error);
      expect(result.error?.context).toEqual({ field: 'content', reason: 'required' });
    });
  });

  describe('fromHttpResponse', () => {
    function mockResponse(status: number, body: unknown, ok?: boolean): Response {
      return {
        ok: ok ?? (status >= 200 && status < 300),
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        json: () => Promise.resolve(body),
      } as Response;
    }

    it('maps 200 response to success', async () => {
      const resp = mockResponse(200, { id: '123', content: 'hello' });
      const result = await fromHttpResponse<{ id: string; content: string }>(resp);
      expect(result.data).toEqual({ id: '123', content: 'hello' });
      expect(result.error).toBeNull();
    });

    it('maps 404 to not_found error', async () => {
      const resp = mockResponse(404, { message: 'Memory not found' });
      const result = await fromHttpResponse(resp);
      expect(result.data).toBeNull();
      expect(result.error?.code).toBe('not_found');
      expect(result.error?.message).toBe('Memory not found');
      expect(result.error?.status).toBe(404);
    });

    it('maps 401 to unauthorized error', async () => {
      const resp = mockResponse(401, { message: 'Invalid token' });
      const result = await fromHttpResponse(resp);
      expect(result.error?.code).toBe('unauthorized');
    });

    it('maps 403 to forbidden error', async () => {
      const resp = mockResponse(403, { message: 'Access denied' });
      const result = await fromHttpResponse(resp);
      expect(result.error?.code).toBe('forbidden');
    });

    it('maps 422 to validation error', async () => {
      const resp = mockResponse(422, { message: 'Invalid field', context: { field: 'content' } });
      const result = await fromHttpResponse(resp);
      expect(result.error?.code).toBe('validation');
      expect(result.error?.context).toEqual({ field: 'content' });
    });

    it('maps 500 to internal error', async () => {
      const resp = mockResponse(500, { message: 'Server error' });
      const result = await fromHttpResponse(resp);
      expect(result.error?.code).toBe('internal');
    });

    it('maps unknown status to http_NNN', async () => {
      const resp = mockResponse(418, { message: 'I am a teapot' });
      const result = await fromHttpResponse(resp);
      expect(result.error?.code).toBe('http_418');
    });

    it('handles non-JSON error body', async () => {
      const resp = {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new Error('not json')),
      } as Response;
      const result = await fromHttpResponse(resp);
      expect(result.error?.code).toBe('bad_gateway');
      expect(result.error?.message).toBe('Bad Gateway');
    });

    it('uses error field as message fallback', async () => {
      const resp = mockResponse(400, { error: 'Bad request body' });
      const result = await fromHttpResponse(resp);
      expect(result.error?.message).toBe('Bad request body');
    });
  });
});
