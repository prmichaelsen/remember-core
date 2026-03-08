import { WebhookService } from './webhook.service.js';
import type { WebhookEnvelope } from './events.js';

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('WebhookService', () => {
  let service: WebhookService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('ok', { status: 200 }),
    );
    service = new WebhookService(mockLogger, {
      url: 'https://example.com/webhooks',
      signingSecret: 'test-secret',
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('buildEnvelope', () => {
    it('builds a valid envelope with all required fields', () => {
      const envelope = service.buildEnvelope(
        { type: 'memory.published_to_space', memory_id: 'm1', title: 'Test', space_id: 's1', owner_id: 'u1' },
        { type: 'user', id: 'u1' },
      );

      expect(envelope).toMatchObject({
        source: 'remember-core',
        api_version: '1',
        type: 'memory.published_to_space',
        actor: { type: 'user', id: 'u1' },
        data: {
          type: 'memory.published_to_space',
          memory_id: 'm1',
          title: 'Test',
          space_id: 's1',
          owner_id: 'u1',
        },
      });
      expect(envelope.id).toBeDefined();
      expect(typeof envelope.timestamp).toBe('number');
    });

    it('omits actor when not provided', () => {
      const envelope = service.buildEnvelope(
        { type: 'memory.retracted', memory_id: 'm1', owner_id: 'u1', targets: [] },
      );
      expect(envelope.actor).toBeUndefined();
    });
  });

  describe('send', () => {
    it('sends POST with correct headers', async () => {
      const envelope = service.buildEnvelope(
        { type: 'memory.published_to_group', memory_id: 'm1', title: 'T', group_id: 'g1', owner_id: 'u1' },
      );

      await service.send(envelope);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://example.com/webhooks');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['webhook-id']).toBe(envelope.id);
      expect(options.headers['webhook-timestamp']).toBe(String(envelope.timestamp));
      expect(options.headers['webhook-signature']).toMatch(/^v1,.+$/);
    });

    it('throws on non-ok response', async () => {
      fetchSpy.mockResolvedValueOnce(new Response('error', { status: 500 }));
      const envelope = service.buildEnvelope(
        { type: 'memory.retracted', memory_id: 'm1', owner_id: 'u1', targets: [] },
      );

      await expect(service.send(envelope)).rejects.toThrow('Webhook delivery failed: HTTP 500');
    });
  });

  describe('emit', () => {
    it('fires without blocking (fire-and-forget)', () => {
      service.emit(
        { type: 'memory.published_to_space', memory_id: 'm1', title: 'T', space_id: 's1', owner_id: 'u1' },
        { type: 'user', id: 'u1' },
      );

      // emit returns void synchronously — fetch is called but not awaited
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('logs errors on delivery failure without throwing', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('network down'));

      service.emit(
        { type: 'memory.published_to_space', memory_id: 'm1', title: 'T', space_id: 's1', owner_id: 'u1' },
      );

      // Wait for the async catch to fire
      await new Promise((r) => setTimeout(r, 10));

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[WebhookService] delivery failed',
        expect.objectContaining({ type: 'memory.published_to_space' }),
      );
    });

    it('calls onError callback on delivery failure', async () => {
      const onError = jest.fn();
      const svc = new WebhookService(mockLogger, {
        url: 'https://example.com/webhooks',
        signingSecret: 'test-secret',
        onError,
      });
      fetchSpy.mockRejectedValueOnce(new Error('fail'));

      svc.emit(
        { type: 'memory.retracted', memory_id: 'm1', owner_id: 'u1', targets: [] },
      );

      await new Promise((r) => setTimeout(r, 10));

      expect(onError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ type: 'memory.retracted' }),
      );
    });
  });
});
