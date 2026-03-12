// src/clients/svc/v1/reports.spec.ts
import { createReportsResource } from './reports';
import type { HttpClient } from '../../http';

function createMockHttpClient(): HttpClient {
  return {
    request: jest.fn().mockResolvedValue({ data: {}, error: null, throwOnError: () => ({}) }),
  } as unknown as HttpClient;
}

describe('ReportsResource', () => {
  let http: HttpClient;

  beforeEach(() => {
    http = createMockHttpClient();
  });

  it('create calls POST /api/svc/v1/reports', async () => {
    const reports = createReportsResource(http);
    await reports.create('user1', { memory_id: 'mem-1', reason: 'spam' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/reports', {
      userId: 'user1',
      body: { memory_id: 'mem-1', reason: 'spam' },
    });
  });

  it('create passes optional description', async () => {
    const reports = createReportsResource(http);
    await reports.create('user1', { memory_id: 'mem-1', reason: 'harassment', description: 'details' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/reports', {
      userId: 'user1',
      body: { memory_id: 'mem-1', reason: 'harassment', description: 'details' },
    });
  });

  it('listMine calls GET /api/svc/v1/reports', async () => {
    const reports = createReportsResource(http);
    await reports.listMine('user1');

    expect(http.request).toHaveBeenCalledWith('GET', '/api/svc/v1/reports', {
      userId: 'user1',
    });
  });

  it('listPending calls GET /api/svc/v1/reports/pending without limit', async () => {
    const reports = createReportsResource(http);
    await reports.listPending('user1');

    expect(http.request).toHaveBeenCalledWith('GET', '/api/svc/v1/reports/pending', {
      userId: 'user1',
    });
  });

  it('listPending calls GET /api/svc/v1/reports/pending with limit', async () => {
    const reports = createReportsResource(http);
    await reports.listPending('user1', 25);

    expect(http.request).toHaveBeenCalledWith('GET', '/api/svc/v1/reports/pending?limit=25', {
      userId: 'user1',
    });
  });

  it('get calls GET /api/svc/v1/reports/{reportId}', async () => {
    const reports = createReportsResource(http);
    await reports.get('user1', 'rpt-123');

    expect(http.request).toHaveBeenCalledWith('GET', '/api/svc/v1/reports/rpt-123', {
      userId: 'user1',
    });
  });

  it('resolve calls POST /api/svc/v1/reports/{reportId}/resolve', async () => {
    const reports = createReportsResource(http);
    await reports.resolve('user1', 'rpt-123', { resolution: 'content removed' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/reports/rpt-123/resolve', {
      userId: 'user1',
      body: { resolution: 'content removed' },
    });
  });

  it('resolve passes optional status', async () => {
    const reports = createReportsResource(http);
    await reports.resolve('user1', 'rpt-123', { resolution: 'warned user', status: 'reviewed' });

    expect(http.request).toHaveBeenCalledWith('POST', '/api/svc/v1/reports/rpt-123/resolve', {
      userId: 'user1',
      body: { resolution: 'warned user', status: 'reviewed' },
    });
  });

  it('listByMemory calls GET /api/svc/v1/reports/by-memory/{memoryId}', async () => {
    const reports = createReportsResource(http);
    await reports.listByMemory('user1', 'mem-456');

    expect(http.request).toHaveBeenCalledWith('GET', '/api/svc/v1/reports/by-memory/mem-456', {
      userId: 'user1',
    });
  });
});
