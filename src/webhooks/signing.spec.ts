import { signWebhookPayload } from './signing.js';
import { createHmac } from 'node:crypto';

describe('signWebhookPayload', () => {
  const webhookId = 'msg_abc123';
  const timestamp = 1700000000;
  const body = '{"type":"memory.published_to_space"}';
  const secret = 'test-secret-key';

  it('returns a v1 prefixed base64 HMAC-SHA256 signature', () => {
    const sig = signWebhookPayload(webhookId, timestamp, body, secret);
    expect(sig).toMatch(/^v1,.+$/);
  });

  it('produces deterministic output', () => {
    const sig1 = signWebhookPayload(webhookId, timestamp, body, secret);
    const sig2 = signWebhookPayload(webhookId, timestamp, body, secret);
    expect(sig1).toBe(sig2);
  });

  it('matches manual HMAC computation', () => {
    const content = `${webhookId}.${timestamp}.${body}`;
    const expected = createHmac('sha256', secret).update(content).digest('base64');

    const sig = signWebhookPayload(webhookId, timestamp, body, secret);
    expect(sig).toBe(`v1,${expected}`);
  });

  it('produces different signatures for different secrets', () => {
    const sig1 = signWebhookPayload(webhookId, timestamp, body, 'secret-a');
    const sig2 = signWebhookPayload(webhookId, timestamp, body, 'secret-b');
    expect(sig1).not.toBe(sig2);
  });

  it('produces different signatures for different bodies', () => {
    const sig1 = signWebhookPayload(webhookId, timestamp, '{"a":1}', secret);
    const sig2 = signWebhookPayload(webhookId, timestamp, '{"b":2}', secret);
    expect(sig1).not.toBe(sig2);
  });
});
