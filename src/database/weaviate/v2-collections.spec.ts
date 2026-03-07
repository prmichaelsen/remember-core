import {
  isCollectionCached,
  cacheCollection,
  clearCollectionCache,
  createUserCollectionSchema,
  createSpaceCollectionSchema,
  createGroupCollectionSchema,
  getUserCollectionProperties,
  getPublishedCollectionProperties,
  FEEL_DIMENSION_PROPERTIES,
  FUNCTIONAL_DIMENSION_PROPERTIES,
  ALL_SCORING_DIMENSIONS,
  COMPOSITE_SCORE_PROPERTIES,
  REM_METADATA_PROPERTIES,
  EMOTIONAL_WEIGHTING_PROPERTIES,
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

// ─── Emotional Weighting Schema (M28) ──────────────────────────────

describe('emotional weighting schema properties', () => {
  describe('property constants', () => {
    it('FEEL_DIMENSION_PROPERTIES has 21 entries', () => {
      expect(FEEL_DIMENSION_PROPERTIES).toHaveLength(21);
    });

    it('FUNCTIONAL_DIMENSION_PROPERTIES has 10 entries', () => {
      expect(FUNCTIONAL_DIMENSION_PROPERTIES).toHaveLength(10);
    });

    it('ALL_SCORING_DIMENSIONS has 31 entries (21 + 10)', () => {
      expect(ALL_SCORING_DIMENSIONS).toHaveLength(31);
    });

    it('COMPOSITE_SCORE_PROPERTIES has 3 entries', () => {
      expect(COMPOSITE_SCORE_PROPERTIES).toHaveLength(3);
    });

    it('REM_METADATA_PROPERTIES has 2 entries', () => {
      expect(REM_METADATA_PROPERTIES).toHaveLength(2);
    });

    it('EMOTIONAL_WEIGHTING_PROPERTIES has 36 entries (31 + 3 + 2)', () => {
      expect(EMOTIONAL_WEIGHTING_PROPERTIES).toHaveLength(36);
    });

    it('all feel_ properties start with feel_ prefix', () => {
      for (const prop of FEEL_DIMENSION_PROPERTIES) {
        expect(prop).toMatch(/^feel_/);
      }
    });

    it('all functional_ properties start with functional_ prefix', () => {
      for (const prop of FUNCTIONAL_DIMENSION_PROPERTIES) {
        expect(prop).toMatch(/^functional_/);
      }
    });

    it('includes feel_valence (special -1 to 1 range)', () => {
      expect(FEEL_DIMENSION_PROPERTIES).toContain('feel_valence');
    });

    it('valence and coherence_tension appear in both layers', () => {
      expect(FEEL_DIMENSION_PROPERTIES).toContain('feel_valence');
      expect(FEEL_DIMENSION_PROPERTIES).toContain('feel_coherence_tension');
      expect(FUNCTIONAL_DIMENSION_PROPERTIES).toContain('functional_valence');
      expect(FUNCTIONAL_DIMENSION_PROPERTIES).toContain('functional_coherence_tension');
    });

    it('composite scores include feel_significance, functional_significance, total_significance', () => {
      expect(COMPOSITE_SCORE_PROPERTIES).toEqual([
        'feel_significance', 'functional_significance', 'total_significance',
      ]);
    });

    it('REM metadata includes rem_touched_at and rem_visits', () => {
      expect(REM_METADATA_PROPERTIES).toEqual(['rem_touched_at', 'rem_visits']);
    });
  });

  describe('schema inclusion', () => {
    it('user collection schema includes all 36 emotional weighting properties', () => {
      const schema = createUserCollectionSchema('test-user');
      const propNames = schema.properties.map((p: any) => p.name);

      for (const prop of EMOTIONAL_WEIGHTING_PROPERTIES) {
        expect(propNames).toContain(prop);
      }
    });

    it('space collection schema includes all 36 emotional weighting properties', () => {
      const schema = createSpaceCollectionSchema();
      const propNames = schema.properties.map((p: any) => p.name);

      for (const prop of EMOTIONAL_WEIGHTING_PROPERTIES) {
        expect(propNames).toContain(prop);
      }
    });

    it('group collection schema includes all 36 emotional weighting properties', () => {
      const schema = createGroupCollectionSchema('test-group');
      const propNames = schema.properties.map((p: any) => p.name);

      for (const prop of EMOTIONAL_WEIGHTING_PROPERTIES) {
        expect(propNames).toContain(prop);
      }
    });

    it('observation property exists in schema (pre-existing)', () => {
      const schema = createUserCollectionSchema('test-user');
      const propNames = schema.properties.map((p: any) => p.name);
      expect(propNames).toContain('observation');
    });

    it('getUserCollectionProperties includes emotional weighting properties', () => {
      const props = getUserCollectionProperties();
      for (const prop of EMOTIONAL_WEIGHTING_PROPERTIES) {
        expect(props).toContain(prop);
      }
    });

    it('getPublishedCollectionProperties includes emotional weighting properties', () => {
      const props = getPublishedCollectionProperties();
      for (const prop of EMOTIONAL_WEIGHTING_PROPERTIES) {
        expect(props).toContain(prop);
      }
    });
  });

  describe('property types', () => {
    it('all scoring dimensions are NUMBER type', () => {
      const schema = createUserCollectionSchema('test-user');
      const propMap = new Map(schema.properties.map((p: any) => [p.name, p.dataType]));

      for (const dim of ALL_SCORING_DIMENSIONS) {
        expect(propMap.get(dim)).toBe('number');
      }
    });

    it('all composite scores are NUMBER type', () => {
      const schema = createUserCollectionSchema('test-user');
      const propMap = new Map(schema.properties.map((p: any) => [p.name, p.dataType]));

      for (const comp of COMPOSITE_SCORE_PROPERTIES) {
        expect(propMap.get(comp)).toBe('number');
      }
    });

    it('rem_touched_at is TEXT type', () => {
      const schema = createUserCollectionSchema('test-user');
      const propMap = new Map(schema.properties.map((p: any) => [p.name, p.dataType]));
      expect(propMap.get('rem_touched_at')).toBe('text');
    });

    it('rem_visits is INT type', () => {
      const schema = createUserCollectionSchema('test-user');
      const propMap = new Map(schema.properties.map((p: any) => [p.name, p.dataType]));
      expect(propMap.get('rem_visits')).toBe('int');
    });
  });

  describe('no duplicate properties', () => {
    it('user collection schema has no duplicate property names', () => {
      const schema = createUserCollectionSchema('test-user');
      const names = schema.properties.map((p: any) => p.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });
  });
});
