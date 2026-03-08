/**
 * BatchedWebhookService — implements EventBus with batched delivery
 * and multi-tenant endpoint resolution.
 *
 * Events are buffered per destination URL and flushed either when
 * maxBatchSize is reached or after flushIntervalMs — whichever comes first.
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

export interface WebhookEndpoint {
  url: string;
  signingSecret: string;
}

export type WebhookConfigResolver = (ownerId: string) => WebhookEndpoint | undefined;

export interface BatchedWebhookServiceConfig {
  resolveEndpoint: WebhookConfigResolver;
  maxBatchSize?: number;
  flushIntervalMs?: number;
  timeoutMs?: number;
  onError?: (error: unknown, envelopes: WebhookEnvelope[]) => void;
}

interface UrlBuffer {
  endpoint: WebhookEndpoint;
  envelopes: WebhookEnvelope[];
  timer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_MAX_BATCH_SIZE = 20;
const DEFAULT_FLUSH_INTERVAL_MS = 1_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const SOURCE = 'remember-core';
const API_VERSION = '1';

export class BatchedWebhookService implements EventBus {
  private readonly resolveEndpoint: WebhookConfigResolver;
  private readonly maxBatchSize: number;
  private readonly flushIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly onError?: (error: unknown, envelopes: WebhookEnvelope[]) => void;
  private readonly buffers = new Map<string, UrlBuffer>();

  constructor(
    private readonly logger: Logger,
    config: BatchedWebhookServiceConfig,
  ) {
    this.resolveEndpoint = config.resolveEndpoint;
    this.maxBatchSize = config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
    this.flushIntervalMs = config.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.onError = config.onError;
  }

  emit(event: WebhookEventData, actor?: WebhookActor): void {
    const ownerId = event.owner_id;
    const endpoint = this.resolveEndpoint(ownerId);

    if (!endpoint) {
      this.logger.debug?.('[BatchedWebhookService] no endpoint for owner, dropping event', {
        owner_id: ownerId,
        type: event.type,
      });
      return;
    }

    const envelope = this.buildEnvelope(event, actor);
    const url = endpoint.url;

    let buffer = this.buffers.get(url);
    if (!buffer) {
      buffer = { endpoint, envelopes: [], timer: null };
      this.buffers.set(url, buffer);
    }

    buffer.envelopes.push(envelope);

    if (buffer.envelopes.length >= this.maxBatchSize) {
      this.flush(url);
    } else if (!buffer.timer) {
      buffer.timer = setTimeout(() => this.flush(url), this.flushIntervalMs);
    }
  }

  flush(url: string): void {
    const buffer = this.buffers.get(url);
    if (!buffer || buffer.envelopes.length === 0) return;

    const envelopes = buffer.envelopes;
    const endpoint = buffer.endpoint;

    if (buffer.timer) {
      clearTimeout(buffer.timer);
    }

    buffer.envelopes = [];
    buffer.timer = null;

    this.sendBatch(url, endpoint, envelopes).catch((err) => {
      this.logger.error?.('[BatchedWebhookService] batch delivery failed', {
        error: err,
        url,
        count: envelopes.length,
      });
      this.onError?.(err, envelopes);
    });
  }

  dispose(): void {
    for (const url of this.buffers.keys()) {
      this.flush(url);
    }
  }

  private async sendBatch(
    url: string,
    endpoint: WebhookEndpoint,
    envelopes: WebhookEnvelope[],
  ): Promise<void> {
    const batchId = uuidv4();
    const batchTimestamp = Math.floor(Date.now() / 1000);
    const body = JSON.stringify(envelopes);
    const signature = signWebhookPayload(batchId, batchTimestamp, body, endpoint.signingSecret);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'webhook-id': batchId,
          'webhook-timestamp': String(batchTimestamp),
          'webhook-signature': signature,
          'x-webhook-batch': 'true',
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Webhook batch delivery failed: HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildEnvelope(event: WebhookEventData, actor?: WebhookActor): WebhookEnvelope {
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
