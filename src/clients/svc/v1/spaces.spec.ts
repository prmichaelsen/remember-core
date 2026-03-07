// src/clients/svc/v1/spaces.spec.ts
import { createSpacesResource } from './spaces';
import { createConfirmationsResource } from './confirmations';
import type { HttpClient } from '../../http';

function createMockHttpClient(): HttpClient {
  return {
    request: jest.fn().mockResolvedValue({ data: {}, error: null, throwOnError: () => ({}) }),
  } as unknown as HttpClient;
}

describe('SpacesResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  it('publish calls POST /api/svc/v1/spaces/publish', async () => {
    const spaces = createSpacesResource(http);
    await spaces.publish('user1', { memory_id: 'mem-1', spaces: ['public'] });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/publish', {
      userId: 'user1',
      body: { memory_id: 'mem-1', spaces: ['public'] },
    });
  });

  it('retract calls POST /api/svc/v1/spaces/retract', async () => {
    const spaces = createSpacesResource(http);
    await spaces.retract('user1', { memory_id: 'mem-1' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/retract', {
      userId: 'user1',
      body: { memory_id: 'mem-1' },
    });
  });

  it('revise calls POST /api/svc/v1/spaces/revise', async () => {
    const spaces = createSpacesResource(http);
    await spaces.revise('user1', { memory_id: 'mem-1' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/revise', {
      userId: 'user1',
      body: { memory_id: 'mem-1' },
    });
  });

  it('moderate calls POST /api/svc/v1/spaces/moderate', async () => {
    const spaces = createSpacesResource(http);
    await spaces.moderate('user1', { memory_id: 'mem-1', action: 'approve' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/moderate', {
      userId: 'user1',
      body: { memory_id: 'mem-1', action: 'approve' },
    });
  });

  it('search calls POST /api/svc/v1/spaces/search', async () => {
    const spaces = createSpacesResource(http);
    await spaces.search('user1', { query: 'profiles', spaces: ['public'] });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/search', {
      userId: 'user1',
      body: { query: 'profiles', spaces: ['public'] },
    });
  });

  it('query calls POST /api/svc/v1/spaces/query', async () => {
    const spaces = createSpacesResource(http);
    await spaces.query('user1', { query: 'recent posts', limit: 10 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/query', {
      userId: 'user1',
      body: { query: 'recent posts', limit: 10 },
    });
  });

  it('byDiscovery calls POST /api/svc/v1/spaces/by-discovery', async () => {
    const spaces = createSpacesResource(http);
    await spaces.byDiscovery('user1', { query: 'explore', spaces: ['public'], limit: 20 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/by-discovery', {
      userId: 'user1',
      body: { query: 'explore', spaces: ['public'], limit: 20 },
    });
  });

  it('byRecommendation calls POST /api/svc/v1/spaces/by-recommendation', async () => {
    const spaces = createSpacesResource(http);
    await spaces.byRecommendation('user1', { userId: 'user1', spaces: ['public'], limit: 20 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/by-recommendation', {
      userId: 'user1',
      body: { userId: 'user1', spaces: ['public'], limit: 20 },
    });
  });

  it('byTime calls POST /api/svc/v1/spaces/by-time', async () => {
    const spaces = createSpacesResource(http);
    await spaces.byTime('user1', { spaces: ['the_void'], limit: 10, direction: 'desc' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/by-time', {
      userId: 'user1',
      body: { spaces: ['the_void'], limit: 10, direction: 'desc' },
    });
  });

  it('byRating calls POST /api/svc/v1/spaces/by-rating', async () => {
    const spaces = createSpacesResource(http);
    await spaces.byRating('user1', { spaces: ['the_void'], limit: 10 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/by-rating', {
      userId: 'user1',
      body: { spaces: ['the_void'], limit: 10 },
    });
  });

  it('byProperty calls POST /api/svc/v1/spaces/by-property', async () => {
    const spaces = createSpacesResource(http);
    await spaces.byProperty('user1', { spaces: ['the_void'], sort_field: 'weight', sort_direction: 'desc' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/by-property', {
      userId: 'user1',
      body: { spaces: ['the_void'], sort_field: 'weight', sort_direction: 'desc' },
    });
  });

  it('byBroad calls POST /api/svc/v1/spaces/by-broad', async () => {
    const spaces = createSpacesResource(http);
    await spaces.byBroad('user1', { spaces: ['the_void'], limit: 20 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/by-broad', {
      userId: 'user1',
      body: { spaces: ['the_void'], limit: 20 },
    });
  });

  it('byRandom calls POST /api/svc/v1/spaces/by-random', async () => {
    const spaces = createSpacesResource(http);
    await spaces.byRandom('user1', { spaces: ['the_void'], limit: 5 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/by-random', {
      userId: 'user1',
      body: { spaces: ['the_void'], limit: 5 },
    });
  });

  it('byCurated calls POST /api/svc/v1/spaces/by-curated', async () => {
    const spaces = createSpacesResource(http);
    await spaces.byCurated('user1', { spaces: ['the_void'], limit: 10 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/spaces/by-curated', {
      userId: 'user1',
      body: { spaces: ['the_void'], limit: 10 },
    });
  });
});

describe('ConfirmationsResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  it('confirm calls POST /api/svc/v1/confirmations/:token/confirm', async () => {
    const confirmations = createConfirmationsResource(http);
    await confirmations.confirm('user1', 'tok-abc');

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/confirmations/tok-abc/confirm', {
      userId: 'user1',
    });
  });

  it('deny calls POST /api/svc/v1/confirmations/:token/deny', async () => {
    const confirmations = createConfirmationsResource(http);
    await confirmations.deny('user1', 'tok-abc');

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/confirmations/tok-abc/deny', {
      userId: 'user1',
    });
  });
});
