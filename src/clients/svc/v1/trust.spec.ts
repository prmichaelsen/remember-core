// src/clients/svc/v1/trust.spec.ts
import { createTrustResource } from './trust';
import { createPreferencesResource } from './preferences';
import { createHealthResource } from './health';
import type { HttpClient } from '../../http';

function createMockHttpClient(): HttpClient {
  return {
    request: jest.fn().mockResolvedValue({ data: {}, error: null, throwOnError: () => ({}) }),
  } as unknown as HttpClient;
}

describe('TrustResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  it('getGhostConfig calls GET /api/svc/v1/trust/ghost-config', async () => {
    const trust = createTrustResource(http);
    await trust.getGhostConfig('user1');

    expect(http.request).toHaveBeenCalledWith('GET', '/api/svc/v1/trust/ghost-config', {
      userId: 'user1',
    });
  });

  it('updateGhostConfig calls PATCH /api/svc/v1/trust/ghost-config', async () => {
    const trust = createTrustResource(http);
    await trust.updateGhostConfig('user1', { enabled: true });

    expect(http.request).toHaveBeenCalledWith('PATCH', '/api/svc/v1/trust/ghost-config', {
      userId: 'user1',
      body: { enabled: true },
    });
  });

  it('setUserTrust calls POST /api/svc/v1/trust/set-user-trust', async () => {
    const trust = createTrustResource(http);
    await trust.setUserTrust('user1', { target_user_id: 'user2', trust_level: 0.8 });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/trust/set-user-trust', {
      userId: 'user1',
      body: { target_user_id: 'user2', trust_level: 0.8 },
    });
  });

  it('removeUserTrust calls POST /api/svc/v1/trust/remove-user-trust', async () => {
    const trust = createTrustResource(http);
    await trust.removeUserTrust('user1', { target_user_id: 'user2' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/trust/remove-user-trust', {
      userId: 'user1',
      body: { target_user_id: 'user2' },
    });
  });

  it('blockUser calls POST /api/svc/v1/trust/block-user', async () => {
    const trust = createTrustResource(http);
    await trust.blockUser('user1', { target_user_id: 'user2' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/trust/block-user', {
      userId: 'user1',
      body: { target_user_id: 'user2' },
    });
  });

  it('unblockUser calls POST /api/svc/v1/trust/unblock-user', async () => {
    const trust = createTrustResource(http);
    await trust.unblockUser('user1', { target_user_id: 'user2' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/trust/unblock-user', {
      userId: 'user1',
      body: { target_user_id: 'user2' },
    });
  });

  it('checkAccess calls POST /api/svc/v1/trust/check-access', async () => {
    const trust = createTrustResource(http);
    await trust.checkAccess('user1', { memory_id: 'mem-1', accessor_id: 'user2' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/trust/check-access', {
      userId: 'user1',
      body: { memory_id: 'mem-1', accessor_id: 'user2' },
    });
  });
});

describe('PreferencesResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  it('get calls GET /api/svc/v1/preferences', async () => {
    const preferences = createPreferencesResource(http);
    await preferences.get('user1');

    expect(http.request).toHaveBeenCalledWith('GET', '/api/svc/v1/preferences', {
      userId: 'user1',
    });
  });

  it('update calls PATCH /api/svc/v1/preferences', async () => {
    const preferences = createPreferencesResource(http);
    await preferences.update('user1', { theme: 'dark' });

    expect(http.request).toHaveBeenCalledWith('PATCH', '/api/svc/v1/preferences', {
      userId: 'user1',
      body: { theme: 'dark' },
    });
  });
});

describe('HealthResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  it('check calls GET /health (no userId)', async () => {
    const health = createHealthResource(http);
    await health.check();

    expect(http.request).toHaveBeenCalledWith('GET', '/health');
  });

  it('version calls GET /version (no userId)', async () => {
    const health = createHealthResource(http);
    await health.version();

    expect(http.request).toHaveBeenCalledWith('GET', '/version');
  });
});
