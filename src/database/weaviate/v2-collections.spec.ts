import {
  isCollectionCached,
  cacheCollection,
  clearCollectionCache,
} from './v2-collections.js';

describe('collection initialization cache', () => {
  beforeEach(() => {
    clearCollectionCache();
  });

  it('returns false for uncached collection', () => {
    expect(isCollectionCached('Memory_users_abc')).toBe(false);
  });

  it('returns true after caching', () => {
    cacheCollection('Memory_users_abc');
    expect(isCollectionCached('Memory_users_abc')).toBe(true);
  });

  it('isolates different collection names', () => {
    cacheCollection('Memory_users_abc');
    expect(isCollectionCached('Memory_users_xyz')).toBe(false);
  });

  it('clearCollectionCache removes all entries', () => {
    cacheCollection('Memory_users_abc');
    cacheCollection('Memory_spaces_public');
    clearCollectionCache();
    expect(isCollectionCached('Memory_users_abc')).toBe(false);
    expect(isCollectionCached('Memory_spaces_public')).toBe(false);
  });

  it('expires after TTL', () => {
    const realNow = Date.now;
    const start = Date.now();

    // Cache at current time
    Date.now = () => start;
    cacheCollection('Memory_users_abc');
    expect(isCollectionCached('Memory_users_abc')).toBe(true);

    // Advance past TTL (60s)
    Date.now = () => start + 61_000;
    expect(isCollectionCached('Memory_users_abc')).toBe(false);

    Date.now = realNow;
  });

  it('cache hit within TTL', () => {
    const realNow = Date.now;
    const start = Date.now();

    Date.now = () => start;
    cacheCollection('Memory_users_abc');

    // 30s later — still valid
    Date.now = () => start + 30_000;
    expect(isCollectionCached('Memory_users_abc')).toBe(true);

    Date.now = realNow;
  });
});
