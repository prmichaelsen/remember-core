/**
 * WebhookService — implements EventBus, delivers webhook events via HTTP.
 *
 * Fire-and-forget: emit() kicks off async delivery without awaiting.
 * Failures are logged, not retried.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Logger } from '../utils/logger.js';
import { signWebhookPayload } from './signing.js';
import type {
  EventBus,
  WebhookActor,
  WebhookEnvelope,
  WebhookEventData,
} from './events.js';

export interface WebhookServiceConfig {
  url: string;
  signingSecret: string;
  timeoutMs?: number;
  onError?: (error: unknown, envelope: WebhookEnvelope) => void;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const SOURCE = 'remember-core';
const API_VERSION = '1';

export class WebhookService implements EventBus {
  private readonly url: string;
  private readonly signingSecret: string;
  private readonly timeoutMs: number;
  private readonly onError?: (error: unknown, envelope: WebhookEnvelope) => void;

  constructor(
    private readonly logger: Logger,
    config: WebhookServiceConfig,
  ) {
    this.url = config.url;
    this.signingSecret = config.signingSecret;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onError = config.onError;
  }

  /**
   * Fire-and-forget: starts async delivery, does not await.
   */
  emit(event: WebhookEventData, actor?: WebhookActor): void {
    const envelope = this.buildEnvelope(event, actor);
    this.send(envelope).catch((err) => {
      this.logger.error?.('[WebhookService] delivery failed', { error: err, type: event.type });
      this.onError?.(err, envelope);
    });
  }

  /**
   * Builds and sends a webhook envelope. Exposed for direct use (e.g. follow_up_due).
   */
  async send(envelope: WebhookEnvelope): Promise<void> {
    const body = JSON.stringify(envelope);
    const signature = signWebhookPayload(
      envelope.id,
      envelope.timestamp,
      body,
      this.signingSecret,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': envelope.id,
          'webhook-timestamp': String(envelope.timestamp),
          'webhook-signature': signature,
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Webhook delivery failed: HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Build a WebhookEnvelope from event data.
   */
  buildEnvelope(event: WebhookEventData, actor?: WebhookActor): WebhookEnvelope {
    return {
      id: uuidv4(),
      timestamp: Math.floor(Date.now() / 1000),
      source: SOURCE,
      api_version: API_VERSION,
      type: event.type,
      actor,
      data: event,
    };
  }
}
