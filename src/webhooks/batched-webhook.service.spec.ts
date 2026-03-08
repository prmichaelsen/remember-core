import { BatchedWebhookService, type WebhookEndpoint } from './batched-webhook.service.js';
import { signWebhookPayload } from './signing.js';
import type { WebhookEnvelope, WebhookEventData } from './events.js';

jest.useFakeTimers();

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const endpoint1: WebhookEndpoint = { url: 'https://tenant-a.com/webhook', signingSecret: 'secret-a' };
const endpoint2: WebhookEndpoint = { url: 'https://tenant-b.com/webhook', signingSecret: 'secret-b' };

function makeEvent(ownerId: string, type: WebhookEventData['type'] = 'memory.published_to_space'): WebhookEventData {
  if (type === 'memory.retracted') {
    return { type, memory_id: 'mem-1', owner_id: ownerId, targets: [] };
  }
  if (type === 'memory.follow_up_due') {
    return { type, memory_id: 'mem-1', title: 'Test', owner_id: ownerId, follow_up_at: '2026-01-01' };
  }
  if (type === 'memory.published_to_group') {
    return { type, memory_id: 'mem-1', title: 'Test', group_id: 'grp-1', owner_id: ownerId };
  }
  return { type, memory_id: 'mem-1', title: 'Test', space_id: 'sp-1', owner_id: ownerId };
}

describe('BatchedWebhookService', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 200 }),
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('flushes after flushIntervalMs timeout', async () => {
    const svc = new BatchedWebhookService(mockLogger, {
      resolveEndpoint: () => endpoint1,
      flushIntervalMs: 500,
    });

    svc.emit(makeEvent('owner-1'));
    expect(fetchSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    await Promise.resolve(); // let microtask settle

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    svc.dispose();
  });

  it('flushes at maxBatchSize threshold', async () => {
    const svc = new BatchedWebhookService(mockLogger, {
      resolveEndpoint: () => endpoint1,
      maxBatchSize: 3,
    });

    svc.emit(makeEvent('owner-1'));
    svc.emit(makeEvent('owner-1'));
    expect(fetchSpy).not.toHaveBeenCalled();

    svc.emit(makeEvent('owner-1'));
    // flush is sync-triggered, but sendBatch is async
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toHaveLength(3);

    svc.dispose();
  });

  it('routes multi-tenant events to separate endpoints', async () => {
    const resolver = (ownerId: string) => {
      if (ownerId === 'owner-a') return endpoint1;
      if (ownerId === 'owner-b') return endpoint2;
      return undefined;
    };
    const svc = new BatchedWebhookService(mockLogger, {
      resolveEndpoint: resolver,
      maxBatchSize: 1,
    });

    svc.emit(makeEvent('owner-a'));
    svc.emit(makeEvent('owner-b'));
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const urls = fetchSpy.mock.calls.map((c: unknown[]) => c[0]);
    expect(urls).toContain(endpoint1.url);
    expect(urls).toContain(endpoint2.url);

    svc.dispose();
  });

  it('drops events when resolver returns undefined', () => {
    const svc = new BatchedWebhookService(mockLogger, {
      resolveEndpoint: () => undefined,
    });

    svc.emit(makeEvent('unknown-owner'));
    jest.advanceTimersByTime(5000);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('no endpoint for owner'),
      expect.objectContaining({ owner_id: 'unknown-owner' }),
    );

    svc.dispose();
  });

  it('sends batch body as WebhookEnvelope[] array', async () => {
    const svc = new BatchedWebhookService(mockLogger, {
      resolveEndpoint: () => endpoint1,
      maxBatchSize: 2,
    });

    svc.emit(makeEvent('owner-1'));
    svc.emit(makeEvent('owner-1'));
    await Promise.resolve();

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body) as WebhookEnvelope[];
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).toHaveProperty('id');
    expect(body[0]).toHaveProperty('timestamp');
    expect(body[0]).toHaveProperty('source', 'remember-core');
    expect(body[0]).toHaveProperty('api_version', '1');
    expect(body[0]).toHaveProperty('type', 'memory.published_to_space');
    expect(body[0]).toHaveProperty('data');

    svc.dispose();
  });

  it('signs the full batch body correctly', async () => {
    const svc = new BatchedWebhookService(mockLogger, {
      resolveEndpoint: () => endpoint1,
      maxBatchSize: 1,
    });

    svc.emit(makeEvent('owner-1'));
    await Promise.resolve();

    const call = fetchSpy.mock.calls[0];
    const opts = call[1];
    const headers = opts.headers;
    const body = opts.body;

    const expectedSig = signWebhookPayload(
      headers['webhook-id'],
      Number(headers['webhook-timestamp']),
      body,
      endpoint1.signingSecret,
    );
    expect(headers['webhook-signature']).toBe(expectedSig);

    svc.dispose();
  });

  it('includes x-webhook-batch header', async () => {
    const svc = new BatchedWebhookService(mockLogger, {
      resolveEndpoint: () => endpoint1,
      maxBatchSize: 1,
    });

    svc.emit(makeEvent('owner-1'));
    await Promise.resolve();

    const headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers['x-webhook-batch']).toBe('true');

    svc.dispose();
  });

  it('dispose() flushes remaining events', async () => {
    const svc = new BatchedWebhookService(mockLogger, {
      resolveEndpoint: () => endpoint1,
      flushIntervalMs: 60_000,
    });

    svc.emit(makeEvent('owner-1'));
    svc.emit(makeEvent('owner-1'));
    expect(fetchSpy).not.toHaveBeenCalled();

    svc.dispose();
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toHaveLength(2);
  });

  it('calls onError callback on HTTP failure', async () => {
    const onError = jest.fn();
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    const svc = new BatchedWebhookService(mockLogger, {
      resolveEndpoint: () => endpoint1,
      maxBatchSize: 1,
      onError,
    });

    svc.emit(makeEvent('owner-1'));
    // Flush microtasks so the async catch handler runs
    await jest.runAllTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.arrayContaining([expect.objectContaining({ source: 'remember-core' })]),
    );

    svc.dispose();
  });

  it('emit() returns void synchronously', () => {
    const svc = new BatchedWebhookService(mockLogger, {
      resolveEndpoint: () => endpoint1,
    });

    const result = svc.emit(makeEvent('owner-1'));
    expect(result).toBeUndefined();

    svc.dispose();
  });
});
