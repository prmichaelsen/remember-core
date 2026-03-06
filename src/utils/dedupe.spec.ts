import { dedupeBySourceId, tagWithSource } from './dedupe.js';

function makeObj(uuid: string, originalMemoryId: string | undefined, collectionName: string) {
  return {
    uuid,
    properties: { original_memory_id: originalMemoryId } as Record<string, unknown>,
    _collectionName: collectionName,
    metadata: { score: 0.9 },
  };
}

describe('dedupeBySourceId', () => {
  it('passes through single memory unchanged', () => {
    const objs = [makeObj('a', 'src1', 'Memory_spaces_public')];
    const result = dedupeBySourceId(objs);
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('a');
  });

  it('passes through memories without original_memory_id (originals)', () => {
    const objs = [
      makeObj('a', undefined, 'Memory_users_u1'),
      makeObj('b', undefined, 'Memory_users_u1'),
    ];
    const result = dedupeBySourceId(objs);
    expect(result).toHaveLength(2);
  });

  it('dedupes same source — space wins over group', () => {
    const objs = [
      makeObj('group-copy', 'src1', 'Memory_groups_g1'),
      makeObj('space-copy', 'src1', 'Memory_spaces_public'),
    ];
    const result = dedupeBySourceId(objs);
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('space-copy');
    expect(result[0]._also_in).toEqual([
      { source: 'Memory_groups_g1', id: 'group-copy' },
    ]);
  });

  it('dedupes same source — group wins over personal', () => {
    const objs = [
      makeObj('user-copy', 'src1', 'Memory_users_u1'),
      makeObj('group-copy', 'src1', 'Memory_groups_g1'),
    ];
    const result = dedupeBySourceId(objs);
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('group-copy');
    expect(result[0]._also_in).toEqual([
      { source: 'Memory_users_u1', id: 'user-copy' },
    ]);
  });

  it('dedupes same source — space wins over personal', () => {
    const objs = [
      makeObj('user-copy', 'src1', 'Memory_users_u1'),
      makeObj('space-copy', 'src1', 'Memory_spaces_public'),
    ];
    const result = dedupeBySourceId(objs);
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('space-copy');
  });

  it('same tier (two groups) — viewing group wins', () => {
    const objs = [
      makeObj('g1-copy', 'src1', 'Memory_groups_g1'),
      makeObj('g2-copy', 'src1', 'Memory_groups_g2'),
    ];
    const result = dedupeBySourceId(objs, { viewingGroupId: 'g2' });
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('g2-copy');
  });

  it('same tier (two groups) — alphanumeric fallback when no viewing group', () => {
    const objs = [
      makeObj('g2-copy', 'src1', 'Memory_groups_g2'),
      makeObj('g1-copy', 'src1', 'Memory_groups_g1'),
    ];
    const result = dedupeBySourceId(objs);
    expect(result).toHaveLength(1);
    // g1 < g2 alphanumerically, so Memory_groups_g1 wins
    expect(result[0].uuid).toBe('g1-copy');
  });

  it('enabled: false skips deduplication', () => {
    const objs = [
      makeObj('a', 'src1', 'Memory_spaces_public'),
      makeObj('b', 'src1', 'Memory_groups_g1'),
    ];
    const result = dedupeBySourceId(objs, { enabled: false });
    expect(result).toHaveLength(2);
  });

  it('also_in populated with all losers', () => {
    const objs = [
      makeObj('user-copy', 'src1', 'Memory_users_u1'),
      makeObj('group-copy', 'src1', 'Memory_groups_g1'),
      makeObj('space-copy', 'src1', 'Memory_spaces_public'),
    ];
    const result = dedupeBySourceId(objs);
    expect(result).toHaveLength(1);
    expect(result[0].uuid).toBe('space-copy');
    expect(result[0]._also_in).toHaveLength(2);
    expect(result[0]._also_in).toEqual(
      expect.arrayContaining([
        { source: 'Memory_users_u1', id: 'user-copy' },
        { source: 'Memory_groups_g1', id: 'group-copy' },
      ]),
    );
  });

  it('different source IDs are not deduped', () => {
    const objs = [
      makeObj('a', 'src1', 'Memory_spaces_public'),
      makeObj('b', 'src2', 'Memory_spaces_public'),
    ];
    const result = dedupeBySourceId(objs);
    expect(result).toHaveLength(2);
  });

  it('mixed: some with source ID, some without', () => {
    const objs = [
      makeObj('a', 'src1', 'Memory_users_u1'),
      makeObj('b', undefined, 'Memory_users_u1'),
      makeObj('c', 'src1', 'Memory_spaces_public'),
    ];
    const result = dedupeBySourceId(objs);
    // b has no source ID (kept), a deduped by c
    expect(result).toHaveLength(2);
    const uuids = result.map(r => r.uuid);
    expect(uuids).toContain('b');
    expect(uuids).toContain('c');
  });
});

describe('tagWithSource', () => {
  it('tags objects with collection name', () => {
    const objs = [{ uuid: 'a' }, { uuid: 'b' }];
    const tagged = tagWithSource(objs, 'Memory_spaces_public');
    expect(tagged[0]._collectionName).toBe('Memory_spaces_public');
    expect(tagged[1]._collectionName).toBe('Memory_spaces_public');
  });
});
