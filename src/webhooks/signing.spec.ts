import { signWebhookPayload } from './signing.js';
import { createHmac } from 'node:crypto';

describe('signWebhookPayload', () => {
  const webhookId = 'msg_abc123';
  const timestamp = 1700000000;
  const body = '{"type":"memory.published_to_space"}';
  // Base64-encoded secret per Standard Webhooks spec
  const secret = Buffer.from('test-secret-key').toString('base64');

  it('returns a v1 prefixed base64 HMAC-SHA256 signature', () => {
    const sig = signWebhookPayload(webhookId, timestamp, body, secret);
    expect(sig).toMatch(/^v1,.+$/);
  });

  it('produces deterministic output', () => {
    const sig1 = signWebhookPayload(webhookId, timestamp, body, secret);
    const sig2 = signWebhookPayload(webhookId, timestamp, body, secret);
    expect(sig1).toBe(sig2);
  });

  it('matches manual HMAC computation with base64-decoded secret', () => {
    const content = `${webhookId}.${timestamp}.${body}`;
    const secretBytes = Buffer.from(secret, 'base64');
    const expected = createHmac('sha256', secretBytes).update(content).digest('base64');

    const sig = signWebhookPayload(webhookId, timestamp, body, secret);
    expect(sig).toBe(`v1,${expected}`);
  });

  it('produces different signatures for different secrets', () => {
    const secretA = Buffer.from('secret-a').toString('base64');
    const secretB = Buffer.from('secret-b').toString('base64');
    const sig1 = signWebhookPayload(webhookId, timestamp, body, secretA);
    const sig2 = signWebhookPayload(webhookId, timestamp, body, secretB);
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different bodies', () => {
    const sig1 = signWebhookPayload(webhookId, timestamp, '{"a":1}', secret);
    const sig2 = signWebhookPayload(webhookId, timestamp, '{"b":2}', secret);
    expect(sig1).not.toBe(sig2);
  });
});
