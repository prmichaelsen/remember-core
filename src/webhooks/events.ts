/**
 * Webhook event types, payloads, and EventBus interface.
 */

// ─── Event Types ──────────────────────────────────────────────────────

export type WebhookEventType =
  | 'memory.published_to_space'
  | 'memory.published_to_group'
  | 'memory.retracted'
  | 'memory.follow_up_due';

// ─── Typed Payloads (discriminated union) ─────────────────────────────

export interface PublishedToSpaceData {
  type: 'memory.published_to_space';
  memory_id: string;
  title: string;
  space_id: string;
  owner_id: string;
}

export interface PublishedToGroupData {
  type: 'memory.published_to_group';
  memory_id: string;
  title: string;
  group_id: string;
  owner_id: string;
}

export interface RetractedData {
  type: 'memory.retracted';
  memory_id: string;
  owner_id: string;
  targets: Array<{ kind: 'space' | 'group'; id: string }>;
}

export interface FollowUpDueData {
  type: 'memory.follow_up_due';
  memory_id: string;
  title: string;
  owner_id: string;
  follow_up_at: string;
  content_preview: string;
  space_ids: string[];
  group_ids: string[];
}

export type WebhookEventData =
  | PublishedToSpaceData
  | PublishedToGroupData
  | RetractedData
  | FollowUpDueData;

// ─── Actor ────────────────────────────────────────────────────────────

export interface WebhookActor {
  type: 'user' | 'system';
  id: string;
}

// ─── Wire Format (Standard Webhooks compliant) ────────────────────────

export interface WebhookEnvelope {
  id: string;
  timestamp: number;
  source: string;
  api_version: string;
  type: WebhookEventType;
  actor?: WebhookActor;
  data: WebhookEventData;
}

// ─── Batched Webhook Payload ─────────────────────────────────────────

export interface BatchedWebhookPayload {
  envelopes: WebhookEnvelope[];
}

// ─── EventBus Interface ───────────────────────────────────────────────

export interface EventBus {
  emit(event: WebhookEventData, actor?: WebhookActor): void;
}
