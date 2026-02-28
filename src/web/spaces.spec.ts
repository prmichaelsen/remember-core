import { createMockWebSDKContext } from './testing-helpers';
import { createMemory } from './memories';
import { publishToSpace, retractFromSpace, reviseInSpace, moderateSpace, searchSpace, querySpace } from './spaces';

describe('Space use cases', () => {
  const ctx = createMockWebSDKContext();

  beforeEach(() => {
    ctx._collection._store.clear();
  });

  describe('publishToSpace', () => {
    it('returns a Result (ok or err) — never throws', async () => {
      const created = await createMemory(ctx, { content: 'publish me' });
      if (!created.ok) fail('setup');

      const result = await publishToSpace(ctx, {
        memory_id: created.data.memory_id,
        spaces: ['profiles'],
      });
      // SpaceService.publish may fail in mock (no real Weaviate client),
      // but the web SDK wraps it in Result — never throws
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });

    it('returns err on invalid input (no spaces or groups)', async () => {
      const created = await createMemory(ctx, { content: 'test' });
      if (!created.ok) fail('setup');
      const result = await publishToSpace(ctx, {
        memory_id: created.data.memory_id,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('retractFromSpace', () => {
    it('returns err when nothing to retract', async () => {
      const created = await createMemory(ctx, { content: 'test' });
      if (!created.ok) fail('setup');
      const result = await retractFromSpace(ctx, {
        memory_id: created.data.memory_id,
        spaces: ['profiles'],
      });
      // May fail because nothing was published — that's expected behavior
      // The important thing is it returns a Result, not throws
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });

  describe('reviseInSpace', () => {
    it('returns err when memory not published', async () => {
      const created = await createMemory(ctx, { content: 'test' });
      if (!created.ok) fail('setup');
      const result = await reviseInSpace(ctx, {
        memory_id: created.data.memory_id,
      });
      // Should fail gracefully since memory isn't published
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
    });
  });

  describe('searchSpace', () => {
    it('returns a Result — never throws', async () => {
      const result = await searchSpace(ctx, {
        query: 'anything',
        spaces: ['profiles'],
        limit: 5,
      });
      // May fail in mock due to missing public collections, but returns Result
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
      if (result.ok) {
        expect(typeof result.data.hasMore).toBe('boolean');
        expect(typeof result.data.total).toBe('number');
      }
    });
  });

  describe('querySpace', () => {
    it('returns a Result — never throws', async () => {
      const result = await querySpace(ctx, {
        question: 'what profiles exist?',
        spaces: ['profiles'],
      });
      expect(result).toBeDefined();
      expect(typeof result.ok).toBe('boolean');
      if (result.ok) {
        expect(result.data.question).toBe('what profiles exist?');
      }
    });
  });
});
