/**
 * Factory functions for creating webhook services.
 */

import type { Logger } from '../utils/logger.js';
import { WebhookService, type WebhookServiceConfig } from './webhook.service.js';
import {
  BatchedWebhookService,
  type BatchedWebhookServiceConfig,
} from './batched-webhook.service.js';

/**
 * Creates a WebhookService if REMEMBER_WEBHOOK_URL and REMEMBER_WEBHOOK_SECRET are set.
 *
 * @returns WebhookService or undefined if env vars are missing.
 */
export function createWebhookService(
  logger: Logger,
  overrides?: Partial<WebhookServiceConfig>,
): WebhookService | undefined {
  const url = overrides?.url ?? process.env.REMEMBER_WEBHOOK_URL;
  const signingSecret = overrides?.signingSecret ?? process.env.REMEMBER_WEBHOOK_SECRET;

  if (!url || !signingSecret) {
    return undefined;
  }

  return new WebhookService(logger, {
    url,
    signingSecret,
    timeoutMs: overrides?.timeoutMs,
    onError: overrides?.onError,
  });
}

/**
 * Creates a BatchedWebhookService with multi-tenant endpoint resolution.
 */
export function createBatchedWebhookService(
  logger: Logger,
  config: BatchedWebhookServiceConfig,
): BatchedWebhookService {
  return new BatchedWebhookService(logger, config);
}
