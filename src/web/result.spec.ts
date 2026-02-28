import { ok, err, isOk, mapOk, tryCatch } from './result';
import type { Result } from './result';
import type { WebSDKError } from './errors';

describe('Result type', () => {
  describe('ok()', () => {
    it('creates a success result', () => {
      const result = ok(42);
      expect(result).toEqual({ ok: true, data: 42 });
    });

    it('narrows with if (result.ok)', () => {
      const result: Result<number> = ok(42);
      if (result.ok) {
        expect(result.data).toBe(42);
      } else {
        fail('Should be ok');
      }
    });
  });

  describe('err()', () => {
    it('creates a failure result', () => {
      const error: WebSDKError = { kind: 'not_found', message: 'gone', context: {} };
      const result = err(error);
      expect(result).toEqual({ ok: false, error });
    });

    it('narrows with if (!result.ok)', () => {
      const error: WebSDKError = { kind: 'internal', message: 'fail', context: {} };
      const result: Result<number> = err(error);
      if (!result.ok) {
        expect(result.error.kind).toBe('internal');
      } else {
        fail('Should be err');
      }
    });
  });

  describe('isOk()', () => {
    it('returns true for ok result', () => {
      expect(isOk(ok('hello'))).toBe(true);
    });

    it('returns false for err result', () => {
      expect(isOk(err({ kind: 'internal' as const, message: '', context: {} }))).toBe(false);
    });
  });

  describe('mapOk()', () => {
    it('transforms data on success', () => {
      const result = mapOk(ok(5), (n) => n * 2);
      expect(result).toEqual({ ok: true, data: 10 });
    });

    it('passes error through unchanged', () => {
      const error: WebSDKError = { kind: 'validation', message: 'bad', context: {} };
      const result = mapOk(err(error), (n: number) => n * 2);
      expect(result).toEqual({ ok: false, error });
    });
  });

  describe('tryCatch()', () => {
    it('wraps successful async fn in ok', async () => {
      const result = await tryCatch(async () => 'success');
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data).toBe('success');
    });

    it('wraps thrown error in err with internal kind', async () => {
      const result = await tryCatch(async () => { throw new Error('boom'); });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('internal');
        expect(result.error.message).toBe('boom');
      }
    });

    it('wraps non-Error thrown values', async () => {
      const result = await tryCatch(async () => { throw 'string error'; });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('string error');
      }
    });
  });
});
