import { ok, err, isOk, mapOk, tryCatch } from './result';
import { wrapError } from './errors';
import { ValidationError, NotFoundError, ForbiddenError } from '../errors/app-errors';

describe('Result type', () => {
  describe('ok()', () => {
    it('creates a success result', () => {
      const result = ok(42);
      expect(result).toEqual({ ok: true, data: 42 });
    });

    it('narrows with if (result.ok)', () => {
      const result = ok(42);
      if (result.ok) {
        expect(result.data).toBe(42);
      } else {
        fail('Should be ok');
      }
    });
  });

  describe('err()', () => {
    it('creates a failure result', () => {
      const e = { kind: 'not_found', message: 'gone', context: {} };
      const result = err(e);
      expect(result).toEqual({ ok: false, error: e });
    });

    it('narrows with if (!result.ok)', () => {
      const error = { kind: 'internal', message: 'fail', context: {} };
      const result = err(error);
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
      const e = { kind: 'validation', message: 'bad', context: {} };
      const result = mapOk(err(e), (n) => n * 2);
      expect(result).toEqual({ ok: false, error: e });
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

  describe('wrapError()', () => {
    it('maps ValidationError to validation kind', () => {
      const error = wrapError(new ValidationError('bad input', { name: ['required'] }));
      expect(error.kind).toBe('validation');
      expect(error.message).toBe('bad input');
    });

    it('maps NotFoundError to not_found kind', () => {
      const error = wrapError(new NotFoundError('Memory', 'abc-123'));
      expect(error.kind).toBe('not_found');
      expect(error.message).toContain('abc-123');
    });

    it('maps ForbiddenError to forbidden kind', () => {
      const error = wrapError(new ForbiddenError('Permission denied'));
      expect(error.kind).toBe('forbidden');
    });

    it('maps plain Error to internal kind', () => {
      const error = wrapError(new Error('something broke'));
      expect(error.kind).toBe('internal');
      expect(error.message).toBe('something broke');
    });

    it('maps non-Error values to internal kind', () => {
      const error = wrapError('string thrown');
      expect(error.kind).toBe('internal');
      expect(error.message).toBe('string thrown');
    });
  });
});
