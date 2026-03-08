import { createWebhookService } from './create.js';
import { WebhookService } from './webhook.service.js';

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('createWebhookService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns undefined when no env vars are set', () => {
    delete process.env.REMEMBER_WEBHOOK_URL;
    delete process.env.REMEMBER_WEBHOOK_SECRET;
    expect(createWebhookService(mockLogger)).toBeUndefined();
  });

  it('returns undefined when only URL is set', () => {
    process.env.REMEMBER_WEBHOOK_URL = 'https://example.com';
    delete process.env.REMEMBER_WEBHOOK_SECRET;
    expect(createWebhookService(mockLogger)).toBeUndefined();
  });

  it('returns undefined when only secret is set', () => {
    delete process.env.REMEMBER_WEBHOOK_URL;
    process.env.REMEMBER_WEBHOOK_SECRET = 'secret';
    expect(createWebhookService(mockLogger)).toBeUndefined();
  });

  it('returns WebhookService when both env vars are set', () => {
    process.env.REMEMBER_WEBHOOK_URL = 'https://example.com/webhooks';
    process.env.REMEMBER_WEBHOOK_SECRET = 'secret';
    const svc = createWebhookService(mockLogger);
    expect(svc).toBeInstanceOf(WebhookService);
  });

  it('uses overrides over env vars', () => {
    process.env.REMEMBER_WEBHOOK_URL = 'https://env.com';
    process.env.REMEMBER_WEBHOOK_SECRET = 'env-secret';
    const svc = createWebhookService(mockLogger, {
      url: 'https://override.com',
      signingSecret: 'override-secret',
    });
    expect(svc).toBeInstanceOf(WebhookService);
  });

  it('returns WebhookService with overrides even without env vars', () => {
    delete process.env.REMEMBER_WEBHOOK_URL;
    delete process.env.REMEMBER_WEBHOOK_SECRET;
    const svc = createWebhookService(mockLogger, {
      url: 'https://override.com',
      signingSecret: 'override-secret',
    });
    expect(svc).toBeInstanceOf(WebhookService);
  });
});
