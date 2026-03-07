import { MemoryService } from './memory.service.js';
import { createMockCollection, createMockLogger } from '../testing/weaviate-mock.js';

function createService(collection: ReturnType<typeof createMockCollection>) {
  const mockMemoryIndex = { set: jest.fn(), get: jest.fn(), delete: jest.fn() };
  return new MemoryService(collection as any, 'test-user', createMockLogger(), { memoryIndex: mockMemoryIndex as any });
}

async function insertMemory(
  collection: ReturnType<typeof createMockCollection>,
  id: string,
  props: Record<string, any>,
) {
  await collection.data.insert({
    id,
    properties: {
      doc_type: 'memory',
      user_id: 'user1',
      content: `Memory ${id}`,
      content_type: 'note',
      created_at: new Date().toISOString(),
      ...props,
    },
  });
}

describe('MemoryService.byProperty', () => {
  let collection: ReturnType<typeof createMockCollection>;
  let service: MemoryService;

  beforeEach(() => {
    collection = createMockCollection();
    service = createService(collection);
  });

  it('sorts by total_significance descending', async () => {
    await insertMemory(collection, 'm1', { total_significance: 0.3 });
    await insertMemory(collection, 'm2', { total_significance: 0.9 });
    await insertMemory(collection, 'm3', { total_significance: 0.6 });

    const result = await service.byProperty({
      sort_field: 'total_significance',
      sort_direction: 'desc',
    });

    expect(result.memories).toHaveLength(3);
    expect(result.memories[0].total_significance).toBe(0.9);
    expect(result.memories[1].total_significance).toBe(0.6);
    expect(result.memories[2].total_significance).toBe(0.3);
  });

  it('sorts by feel_trauma ascending', async () => {
    await insertMemory(collection, 'm1', { feel_trauma: 0.8 });
    await insertMemory(collection, 'm2', { feel_trauma: 0.1 });
    await insertMemory(collection, 'm3', { feel_trauma: 0.5 });

    const result = await service.byProperty({
      sort_field: 'feel_trauma',
      sort_direction: 'asc',
    });

    expect(result.memories[0].feel_trauma).toBe(0.1);
    expect(result.memories[1].feel_trauma).toBe(0.5);
    expect(result.memories[2].feel_trauma).toBe(0.8);
  });

  it('accepts functional_* sort fields', async () => {
    await insertMemory(collection, 'm1', { functional_salience: 0.2 });
    await insertMemory(collection, 'm2', { functional_salience: 0.7 });

    const result = await service.byProperty({
      sort_field: 'functional_salience',
      sort_direction: 'desc',
    });

    expect(result.memories[0].functional_salience).toBe(0.7);
    expect(result.memories[1].functional_salience).toBe(0.2);
  });

  it('accepts composite score fields', async () => {
    await insertMemory(collection, 'm1', { feel_significance: 0.4 });
    await insertMemory(collection, 'm2', { feel_significance: 0.9 });

    const result = await service.byProperty({
      sort_field: 'feel_significance',
      sort_direction: 'desc',
    });

    expect(result.memories).toHaveLength(2);
    expect(result.sort_field).toBe('feel_significance');
    expect(result.sort_direction).toBe('desc');
  });

  it('accepts REM metadata fields (rem_touched_at, rem_visits)', async () => {
    await insertMemory(collection, 'm1', { rem_visits: 3 });
    await insertMemory(collection, 'm2', { rem_visits: 1 });
    await insertMemory(collection, 'm3', { rem_visits: 5 });

    const result = await service.byProperty({
      sort_field: 'rem_visits',
      sort_direction: 'desc',
    });

    expect(result.memories[0].rem_visits).toBe(5);
    expect(result.memories[1].rem_visits).toBe(3);
    expect(result.memories[2].rem_visits).toBe(1);
  });

  it('accepts existing properties like created_at', async () => {
    await insertMemory(collection, 'm1', { created_at: '2026-01-01T00:00:00Z' });
    await insertMemory(collection, 'm2', { created_at: '2026-03-01T00:00:00Z' });

    const result = await service.byProperty({
      sort_field: 'created_at',
      sort_direction: 'asc',
    });

    expect(result.memories).toHaveLength(2);
  });

  it('throws for invalid sort_field', async () => {
    await expect(
      service.byProperty({
        sort_field: 'nonexistent_field',
        sort_direction: 'desc',
      }),
    ).rejects.toThrow('Invalid sort_field');
  });

  it('respects limit parameter', async () => {
    for (let i = 0; i < 10; i++) {
      await insertMemory(collection, `m${i}`, { total_significance: i * 0.1 });
    }

    const result = await service.byProperty({
      sort_field: 'total_significance',
      sort_direction: 'desc',
      limit: 3,
    });

    expect(result.memories.length).toBeLessThanOrEqual(3);
    expect(result.limit).toBe(3);
  });

  it('respects offset parameter', async () => {
    await insertMemory(collection, 'm1', { total_significance: 0.9 });
    await insertMemory(collection, 'm2', { total_significance: 0.6 });
    await insertMemory(collection, 'm3', { total_significance: 0.3 });

    const result = await service.byProperty({
      sort_field: 'total_significance',
      sort_direction: 'desc',
      offset: 1,
    });

    expect(result.offset).toBe(1);
    // Should skip the first result
    expect(result.memories.length).toBeLessThanOrEqual(2);
  });

  it('returns sort_field and sort_direction in result', async () => {
    await insertMemory(collection, 'm1', { feel_valence: -0.5 });

    const result = await service.byProperty({
      sort_field: 'feel_valence',
      sort_direction: 'asc',
    });

    expect(result.sort_field).toBe('feel_valence');
    expect(result.sort_direction).toBe('asc');
  });

  it('uses no vector search (pure sort)', async () => {
    await insertMemory(collection, 'm1', { functional_urgency: 0.5 });

    // The method uses fetchObjects with sort, not hybrid/nearText/nearVector
    const hybridSpy = jest.spyOn(collection.query, 'hybrid');
    const nearTextSpy = jest.spyOn(collection.query, 'nearText');

    await service.byProperty({
      sort_field: 'functional_urgency',
      sort_direction: 'desc',
    });

    expect(hybridSpy).not.toHaveBeenCalled();
    expect(nearTextSpy).not.toHaveBeenCalled();
  });

  it('defaults to limit=50 and offset=0', async () => {
    await insertMemory(collection, 'm1', { total_significance: 0.5 });

    const result = await service.byProperty({
      sort_field: 'total_significance',
      sort_direction: 'desc',
    });

    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });
});
