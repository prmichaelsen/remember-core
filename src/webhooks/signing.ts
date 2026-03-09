/**
 * HMAC-SHA256 webhook payload signing (Standard Webhooks spec).
 */

import { createHmac } from 'node:crypto';

/**
 * Signs a webhook payload per the Standard Webhooks spec.
 *
 * Signs the string `${webhookId}.${timestamp}.${body}` with HMAC-SHA256.
 * The secret is expected to be base64-encoded per the Standard Webhooks spec;
 * it is decoded to raw bytes before use as the HMAC key.
 *
 * @returns Signature in the format `v1,{base64}`
 */
export function signWebhookPayload(
  webhookId: string,
  timestamp: number,
  body: string,
  secret: string,
): string {
  const content = `${webhookId}.${timestamp}.${body}`;
  const secretBytes = Buffer.from(secret, 'base64');
  const hmac = createHmac('sha256', secretBytes).update(content).digest('base64');
  return `v1,${hmac}`;
}
