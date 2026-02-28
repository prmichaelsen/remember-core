// src/app/profiles.spec.ts
import { createProfilesResource } from './profiles';
import type { HttpClient } from '../clients/http';

function createMockHttpClient(): HttpClient {
  return {
    request: jest.fn().mockResolvedValue({ data: {}, error: null, throwOnError: () => ({}) }),
  } as unknown as HttpClient;
}

describe('ProfilesResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  it('createAndPublish calls POST /api/app/v1/profiles', async () => {
    const profiles = createProfilesResource(http);
    await profiles.createAndPublish('user1', { display_name: 'John', bio: 'Hello' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/app/v1/profiles', {
      userId: 'user1',
      body: { display_name: 'John', bio: 'Hello' },
    });
  });

  it('search calls POST /api/app/v1/profiles/search', async () => {
    const profiles = createProfilesResource(http);
    await profiles.search('user1', { query: 'developer', limit: 10 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/app/v1/profiles/search', {
      userId: 'user1',
      body: { query: 'developer', limit: 10 },
    });
  });

  it('retract calls DELETE /api/app/v1/profiles/:memoryId', async () => {
    const profiles = createProfilesResource(http);
    await profiles.retract('user1', 'mem-123');

    expect(http.request).toHaveBeenCalledWith('DELETE', '/api/app/v1/profiles/mem-123', {
      userId: 'user1',
    });
  });

  it('updateAndRepublish calls PATCH /api/app/v1/profiles/:memoryId', async () => {
    const profiles = createProfilesResource(http);
    await profiles.updateAndRepublish('user1', 'mem-123', { display_name: 'Jane' });

    expect(http.request).toHaveBeenCalledWith('PATCH', '/api/app/v1/profiles/mem-123', {
      userId: 'user1',
      body: { display_name: 'Jane' },
    });
  });
});
