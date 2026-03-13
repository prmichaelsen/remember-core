/**
 * FollowUpSchedulerService — scans Weaviate for memories with due follow_up_date
 * dates, emits memory.follow_up_due webhook events, and marks memories as notified.
 */

import type { WeaviateClient } from 'weaviate-client';
import { Filters } from 'weaviate-client';
import type { EventBus, WebhookActor } from '../webhooks/events.js';
import type { Logger } from '../utils/logger.js';

export interface FollowUpSchedulerDeps {
  weaviateClient: WeaviateClient;
  eventBus: EventBus;
  logger: Logger;
  collectionEnumerator: () => AsyncIterable<string>;
}

export interface ScanResult {
  scanned: number;
  notified: number;
  failed: number;
}

const FOLLOW_UP_ACTOR: WebhookActor = { type: 'system', id: 'follow-up-scheduler' };
const MAX_FAILURE_COUNT = 3;
const CONTENT_PREVIEW_LENGTH = 200;

function truncate(text: string | undefined | null, maxLen: number): string {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

export class FollowUpSchedulerService {
  private readonly weaviateClient: WeaviateClient;
  private readonly eventBus: EventBus;
  private readonly logger: Logger;
  private readonly collectionEnumerator: () => AsyncIterable<string>;

  constructor(deps: FollowUpSchedulerDeps) {
    this.weaviateClient = deps.weaviateClient;
    this.eventBus = deps.eventBus;
    this.logger = deps.logger;
    this.collectionEnumerator = deps.collectionEnumerator;
  }

  async scanAndNotify(): Promise<ScanResult> {
    const result: ScanResult = { scanned: 0, notified: 0, failed: 0 };
    const now = new Date();

    for await (const collectionId of this.collectionEnumerator()) {
      try {
        await this.scanCollection(collectionId, now, result);
      } catch (err) {
        const errStr = String(err);
        // Collections missing from Weaviate or without follow_up_date in schema — skip silently
        if (errStr.includes('no such prop') || errStr.includes('could not find class')) {
          this.logger.debug('Skipping collection (missing or no follow-up schema)', {
            collection_id: collectionId,
          });
        } else {
          this.logger.error('Failed to scan collection for follow-ups', {
            collection_id: collectionId,
            error: errStr,
          });
        }
      }
    }

    this.logger.info('Follow-up scan complete', {
      scanned: result.scanned,
      notified: result.notified,
      failed: result.failed,
    });

    return result;
  }

  private async scanCollection(collectionId: string, now: Date, result: ScanResult): Promise<void> {
    const collection = this.weaviateClient.collections.get(collectionId) as any;

    // follow_up_date <= now
    const dueDateFilter = collection.filter.byProperty('follow_up_date').lessOrEqual(now);

    // follow_up_failure_count < MAX or null (treat null as 0)
    const notExhaustedFilter = Filters.or(
      collection.filter.byProperty('follow_up_failure_count').lessThan(MAX_FAILURE_COUNT),
      collection.filter.byProperty('follow_up_failure_count').isNull(true),
    );

    // (follow_up_notified_at IS NULL) — never notified
    const neverNotifiedFilter = collection.filter.byProperty('follow_up_notified_at').isNull(true);

    // Fetch memories that have never been notified and are due
    await this.fetchAndProcess(collection, collectionId, Filters.and(dueDateFilter, neverNotifiedFilter, notExhaustedFilter), result);

    // Fetch memories that were notified but rescheduled (follow_up_date > follow_up_notified_at)
    // We query for follow_up_date <= now AND follow_up_notified_at IS NOT NULL, then filter in-memory
    const previouslyNotifiedFilter = collection.filter.byProperty('follow_up_notified_at').isNull(false);
    await this.fetchAndProcessRescheduled(collection, collectionId, Filters.and(dueDateFilter, previouslyNotifiedFilter, notExhaustedFilter), result);
  }

  private async fetchAndProcess(
    collection: any,
    collectionId: string,
    filter: any,
    result: ScanResult,
  ): Promise<void> {
    const response = await collection.query.fetchObjects({
      filters: filter,
      limit: 100,
      returnProperties: [
        'title', 'content', 'user_id', 'owner_id', 'follow_up_date',
        'follow_up_targets', 'follow_up_notified_at',
        'follow_up_failure_count', 'space_ids', 'group_ids',
      ],
    });

    for (const obj of response.objects ?? []) {
      result.scanned++;
      await this.processMemory(collection, collectionId, obj, result);
    }
  }

  private async fetchAndProcessRescheduled(
    collection: any,
    collectionId: string,
    filter: any,
    result: ScanResult,
  ): Promise<void> {
    const response = await collection.query.fetchObjects({
      filters: filter,
      limit: 100,
      returnProperties: [
        'title', 'content', 'user_id', 'owner_id', 'follow_up_date',
        'follow_up_targets', 'follow_up_notified_at',
        'follow_up_failure_count', 'space_ids', 'group_ids',
      ],
    });

    for (const obj of response.objects ?? []) {
      const props = obj.properties as Record<string, unknown>;
      const followUpAt = props.follow_up_date;
      const notifiedAt = props.follow_up_notified_at;

      // Only process if rescheduled: follow_up_date > follow_up_notified_at
      if (followUpAt && notifiedAt && new Date(followUpAt as string).getTime() > new Date(notifiedAt as string).getTime()) {
        result.scanned++;
        await this.processMemory(collection, collectionId, obj, result);
      }
    }
  }

  private async processMemory(
    collection: any,
    collectionId: string,
    obj: { uuid: string; properties: Record<string, unknown> },
    result: ScanResult,
  ): Promise<void> {
    const props = obj.properties;
    const memoryId = obj.uuid;
    // user collections have user_id, space/group collections have owner_id
    const resolvedOwnerId = (props.user_id as string) || (props.owner_id as string) || '';

    try {
      await this.eventBus.emit(
        {
          type: 'memory.follow_up_due',
          memory_id: memoryId,
          title: (props.title as string) || '',
          owner_id: resolvedOwnerId,
          follow_up_at: (props.follow_up_date as string) || '',
          content_preview: truncate(props.content as string, CONTENT_PREVIEW_LENGTH),
          follow_up_targets: (props.follow_up_targets as string[]) || [],
          space_ids: (props.space_ids as string[]) || [],
          group_ids: (props.group_ids as string[]) || [],
        },
        FOLLOW_UP_ACTOR,
      );

      // Mark as notified
      await collection.data.update({
        id: memoryId,
        properties: {
          follow_up_notified_at: new Date().toISOString(),
          follow_up_failure_count: 0,
        },
      });

      result.notified++;
      this.logger.debug('Follow-up notification sent', {
        memory_id: memoryId,
        collection_id: collectionId,
      });
    } catch (err) {
      result.failed++;
      const currentCount = (props.follow_up_failure_count as number) || 0;
      try {
        await collection.data.update({
          id: memoryId,
          properties: { follow_up_failure_count: currentCount + 1 },
        });
      } catch (updateErr) {
        this.logger.error('Failed to update failure count', {
          memory_id: memoryId,
          error: String(updateErr),
        });
      }
      this.logger.warn('Follow-up notification failed', {
        memory_id: memoryId,
        collection_id: collectionId,
        failure_count: currentCount + 1,
        error: String(err),
      });
    }
  }
}

export async function scanAndNotifyFollowUps(
  deps: FollowUpSchedulerDeps,
): Promise<ScanResult> {
  const service = new FollowUpSchedulerService(deps);
  return service.scanAndNotify();
}
