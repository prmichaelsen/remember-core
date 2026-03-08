/**
 * HMAC-SHA256 webhook payload signing (Standard Webhooks spec).
 */

import { createHmac } from 'node:crypto';

/**
 * Signs a webhook payload per the Standard Webhooks spec.
 *
 * Signs the string `${webhookId}.${timestamp}.${body}` with HMAC-SHA256.
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
  const hmac = createHmac('sha256', secret).update(content).digest('base64');
  return `v1,${hmac}`;
}
