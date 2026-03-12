import {
  DefaultSyntheticMemoryRegistry,
  type SyntheticMemoryProvider,
} from './synthetic-memory-registry';

function stubProvider(key: string, result: Record<string, unknown> | null): SyntheticMemoryProvider {
  return { key, fetch: jest.fn().mockResolvedValue(result) };
}

function throwingProvider(key: string): SyntheticMemoryProvider {
  return { key, fetch: jest.fn().mockRejectedValue(new Error('boom')) };
}

describe('DefaultSyntheticMemoryRegistry', () => {
  const userId = 'user-1';
  const ghostId = 'ghost-1';

  it('returns empty array with no providers', async () => {
    const registry = new DefaultSyntheticMemoryRegistry();
    const results = await registry.fetchAll(userId, ghostId);
    expect(results).toEqual([]);
  });

  it('returns result from a single provider', async () => {
    const registry = new DefaultSyntheticMemoryRegistry();
    const mood = { id: 'synthetic:mood:user-1', content: 'happy' };
    registry.register(stubProvider('mood', mood));

    const results = await registry.fetchAll(userId, ghostId);
    expect(results).toEqual([mood]);
  });

  it('returns results from multiple providers', async () => {
    const registry = new DefaultSyntheticMemoryRegistry();
    const mood = { id: 'synthetic:mood:user-1', content: 'happy' };
    const perception = { id: 'synthetic:perception:user-1', content: 'curious' };
    registry.register(stubProvider('mood', mood));
    registry.register(stubProvider('perception', perception));

    const results = await registry.fetchAll(userId, ghostId);
    expect(results).toEqual([mood, perception]);
  });

  it('skips providers that return null', async () => {
    const registry = new DefaultSyntheticMemoryRegistry();
    registry.register(stubProvider('mood', null));
    registry.register(stubProvider('perception', { id: 'p' }));

    const results = await registry.fetchAll(userId, ghostId);
    expect(results).toEqual([{ id: 'p' }]);
  });

  it('skips providers that throw without crashing', async () => {
    const registry = new DefaultSyntheticMemoryRegistry();
    registry.register(throwingProvider('broken'));
    registry.register(stubProvider('mood', { id: 'mood' }));

    const results = await registry.fetchAll(userId, ghostId);
    expect(results).toEqual([{ id: 'mood' }]);
  });

  it('overwrites duplicate key registration', async () => {
    const registry = new DefaultSyntheticMemoryRegistry();
    registry.register(stubProvider('mood', { version: 1 }));
    registry.register(stubProvider('mood', { version: 2 }));

    const results = await registry.fetchAll(userId, ghostId);
    expect(results).toEqual([{ version: 2 }]);
  });

  it('passes userId and ghostCompositeId to providers', async () => {
    const registry = new DefaultSyntheticMemoryRegistry();
    const provider = stubProvider('mood', { id: 'mood' });
    registry.register(provider);

    await registry.fetchAll('u-123', 'g-456');
    expect(provider.fetch).toHaveBeenCalledWith('u-123', 'g-456');
  });
});
