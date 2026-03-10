import { createMockWeaviateClient, createMockLogger } from '../testing/weaviate-mock.js';
import { FollowUpSchedulerService, scanAndNotifyFollowUps } from './follow-up-scheduler.service.js';
import type { EventBus, WebhookActor, WebhookEventData } from '../webhooks/events.js';

function createMockEventBus(): EventBus & { calls: Array<{ event: WebhookEventData; actor?: WebhookActor }> } {
  const calls: Array<{ event: WebhookEventData; actor?: WebhookActor }> = [];
  return {
    calls,
    async emit(event: WebhookEventData, actor?: WebhookActor) {
      calls.push({ event, actor });
    },
  };
}

function pastDate(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function futureDate(minutesAhead: number): string {
  return new Date(Date.now() + minutesAhead * 60_000).toISOString();
}

describe('FollowUpSchedulerService', () => {
  let weaviateClient: ReturnType<typeof createMockWeaviateClient>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    weaviateClient = createMockWeaviateClient();
    eventBus = createMockEventBus();
    logger = createMockLogger();
  });

  function createService(collectionNames: string[] = ['Memory_users_test']) {
    return new FollowUpSchedulerService({
      weaviateClient: weaviateClient as any,
      eventBus,
      logger,
      collectionEnumerator: async function* () {
        for (const name of collectionNames) {
          yield name;
        }
      },
    });
  }

  async function insertMemory(collectionName: string, props: Record<string, any>): Promise<string> {
    const collection = weaviateClient.collections.get(collectionName);
    return collection.data.insert({ properties: props });
  }

  // ─── Scanning ────────────────────────────────────────────────────────

  describe('scanning', () => {
    it('finds memories with follow_up_at <= now and follow_up_notified_at null', async () => {
      await insertMemory('Memory_users_test', {
        title: 'Due memory',
        content: 'Review Q1 goals',
        owner_id: 'user-1',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: ['the_void'],
        group_ids: [],
      });

      const svc = createService();
      const result = await svc.scanAndNotify();

      expect(result.scanned).toBe(1);
      expect(result.notified).toBe(1);
      expect(result.failed).toBe(0);
      expect(eventBus.calls).toHaveLength(1);
      expect(eventBus.calls[0].event.type).toBe('memory.follow_up_due');
    });

    it('skips memories where follow_up_at is in the future', async () => {
      await insertMemory('Memory_users_test', {
        title: 'Future memory',
        content: 'Not due yet',
        owner_id: 'user-1',
        follow_up_at: futureDate(60),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      const svc = createService();
      const result = await svc.scanAndNotify();

      expect(result.scanned).toBe(0);
      expect(result.notified).toBe(0);
      expect(eventBus.calls).toHaveLength(0);
    });

    it('handles empty collections (no due memories)', async () => {
      const svc = createService();
      const result = await svc.scanAndNotify();

      expect(result).toEqual({ scanned: 0, notified: 0, failed: 0 });
    });

    it('handles multiple collections with mixed due/not-due memories', async () => {
      await insertMemory('Collection_A', {
        title: 'Due in A',
        content: 'Content A',
        owner_id: 'user-a',
        follow_up_at: pastDate(10),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      await insertMemory('Collection_B', {
        title: 'Not due in B',
        content: 'Content B',
        owner_id: 'user-b',
        follow_up_at: futureDate(60),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      const svc = createService(['Collection_A', 'Collection_B']);
      const result = await svc.scanAndNotify();

      expect(result.scanned).toBe(1);
      expect(result.notified).toBe(1);
      expect(eventBus.calls).toHaveLength(1);
      expect((eventBus.calls[0].event as any).title).toBe('Due in A');
    });
  });

  // ─── Webhook Emission ────────────────────────────────────────────────

  describe('webhook emission', () => {
    it('emits memory.follow_up_due event with correct FollowUpDueData shape', async () => {
      await insertMemory('Memory_users_test', {
        title: 'Review goals',
        content: 'Check progress on Q1 OKRs',
        owner_id: 'user-1',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: ['user:user-2', 'group:team-alpha'],
        follow_up_failure_count: 0,
        space_ids: ['the_void'],
        group_ids: ['grp-1'],
      });

      const svc = createService();
      await svc.scanAndNotify();

      expect(eventBus.calls).toHaveLength(1);
      const { event, actor } = eventBus.calls[0];
      expect(event.type).toBe('memory.follow_up_due');
      expect(event).toMatchObject({
        type: 'memory.follow_up_due',
        title: 'Review goals',
        owner_id: 'user-1',
        content_preview: 'Check progress on Q1 OKRs',
        follow_up_targets: ['user:user-2', 'group:team-alpha'],
        space_ids: ['the_void'],
        group_ids: ['grp-1'],
      });
      expect(actor).toEqual({ type: 'system', id: 'follow-up-scheduler' });
    });

    it('truncates content_preview to ~200 chars', async () => {
      const longContent = 'A'.repeat(300);
      await insertMemory('Memory_users_test', {
        title: 'Long content',
        content: longContent,
        owner_id: 'user-1',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      const svc = createService();
      await svc.scanAndNotify();

      const event = eventBus.calls[0].event as any;
      expect(event.content_preview.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(event.content_preview).toMatch(/\.\.\.$/);
    });

    it('emits multiple events for multiple due memories', async () => {
      for (let i = 0; i < 3; i++) {
        await insertMemory('Memory_users_test', {
          title: `Memory ${i}`,
          content: `Content ${i}`,
          owner_id: 'user-1',
          follow_up_at: pastDate(5),
          follow_up_notified_at: null,
          follow_up_targets: [],
          follow_up_failure_count: 0,
          space_ids: [],
          group_ids: [],
        });
      }

      const svc = createService();
      const result = await svc.scanAndNotify();

      expect(result.notified).toBe(3);
      expect(eventBus.calls).toHaveLength(3);
    });
  });

  // ─── Deduplication & Rescheduling ────────────────────────────────────

  describe('deduplication & rescheduling', () => {
    it('skips already-notified memories (follow_up_notified_at >= follow_up_at)', async () => {
      const followUpAt = pastDate(60);
      await insertMemory('Memory_users_test', {
        title: 'Already notified',
        content: 'Old notification',
        owner_id: 'user-1',
        follow_up_at: followUpAt,
        follow_up_notified_at: pastDate(30), // notified after follow_up_at
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      const svc = createService();
      const result = await svc.scanAndNotify();

      expect(result.scanned).toBe(0);
      expect(result.notified).toBe(0);
      expect(eventBus.calls).toHaveLength(0);
    });

    it('sets follow_up_notified_at on memory after successful emit', async () => {
      const memId = await insertMemory('Memory_users_test', {
        title: 'Due memory',
        content: 'Content',
        owner_id: 'user-1',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      const svc = createService();
      await svc.scanAndNotify();

      const collection = weaviateClient.collections.get('Memory_users_test');
      const updated = await collection.query.fetchObjectById(memId);
      expect(updated!.properties.follow_up_notified_at).toBeTruthy();
      expect(updated!.properties.follow_up_failure_count).toBe(0);
    });

    it('does not re-notify on second scan after notification', async () => {
      await insertMemory('Memory_users_test', {
        title: 'Due memory',
        content: 'Content',
        owner_id: 'user-1',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      const svc = createService();
      await svc.scanAndNotify();
      expect(eventBus.calls).toHaveLength(1);

      // Second scan should find nothing new
      eventBus.calls.length = 0;
      const result2 = await svc.scanAndNotify();
      expect(result2.notified).toBe(0);
      expect(eventBus.calls).toHaveLength(0);
    });

    it('re-notifies rescheduled follow-up (follow_up_at updated after notification)', async () => {
      const memId = await insertMemory('Memory_users_test', {
        title: 'Rescheduled',
        content: 'Content',
        owner_id: 'user-1',
        follow_up_at: pastDate(60),
        follow_up_notified_at: pastDate(30), // was notified
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      // Simulate reschedule: update follow_up_at to a recent past time (after notified_at)
      const collection = weaviateClient.collections.get('Memory_users_test');
      await collection.data.update({
        id: memId,
        properties: { follow_up_at: pastDate(5) }, // 5 min ago, after notified_at (30 min ago)
      });

      const svc = createService();
      const result = await svc.scanAndNotify();

      expect(result.scanned).toBe(1);
      expect(result.notified).toBe(1);
      expect(eventBus.calls).toHaveLength(1);
    });
  });

  // ─── Retry/Failure ───────────────────────────────────────────────────

  describe('retry/failure', () => {
    it('increments failure counter on emit failure', async () => {
      const failingBus: EventBus = {
        async emit() { throw new Error('Webhook delivery failed'); },
      };

      const memId = await insertMemory('Memory_users_test', {
        title: 'Will fail',
        content: 'Content',
        owner_id: 'user-1',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      const svc = new FollowUpSchedulerService({
        weaviateClient: weaviateClient as any,
        eventBus: failingBus,
        logger,
        collectionEnumerator: async function* () { yield 'Memory_users_test'; },
      });

      const result = await svc.scanAndNotify();

      expect(result.failed).toBe(1);
      expect(result.notified).toBe(0);

      const collection = weaviateClient.collections.get('Memory_users_test');
      const updated = await collection.query.fetchObjectById(memId);
      expect(updated!.properties.follow_up_failure_count).toBe(1);
    });

    it('skips memories with >= 3 failures', async () => {
      await insertMemory('Memory_users_test', {
        title: 'Exhausted retries',
        content: 'Content',
        owner_id: 'user-1',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 3,
        space_ids: [],
        group_ids: [],
      });

      const svc = createService();
      const result = await svc.scanAndNotify();

      expect(result.scanned).toBe(0);
      expect(result.notified).toBe(0);
      expect(eventBus.calls).toHaveLength(0);
    });

    it('resets failure counter on successful emit after prior failures', async () => {
      const memId = await insertMemory('Memory_users_test', {
        title: 'Recovering',
        content: 'Content',
        owner_id: 'user-1',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 2,
        space_ids: [],
        group_ids: [],
      });

      const svc = createService();
      const result = await svc.scanAndNotify();

      expect(result.notified).toBe(1);
      const collection = weaviateClient.collections.get('Memory_users_test');
      const updated = await collection.query.fetchObjectById(memId);
      expect(updated!.properties.follow_up_failure_count).toBe(0);
    });

    it('reports correct counts for partial failure', async () => {
      // First memory will succeed
      await insertMemory('Memory_users_test', {
        title: 'Will succeed',
        content: 'Content',
        owner_id: 'user-1',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      // Second memory will succeed too (we can't easily make one fail with mock)
      await insertMemory('Memory_users_test', {
        title: 'Will also succeed',
        content: 'Content 2',
        owner_id: 'user-2',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      let callCount = 0;
      const partialFailBus: EventBus = {
        async emit() {
          callCount++;
          if (callCount === 2) throw new Error('Second one fails');
        },
      };

      const svc = new FollowUpSchedulerService({
        weaviateClient: weaviateClient as any,
        eventBus: partialFailBus,
        logger,
        collectionEnumerator: async function* () { yield 'Memory_users_test'; },
      });

      const result = await svc.scanAndNotify();

      expect(result.notified).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.scanned).toBe(2);
    });
  });

  // ─── Entry Point ─────────────────────────────────────────────────────

  describe('scanAndNotifyFollowUps entry point', () => {
    it('returns { scanned, notified, failed } summary', async () => {
      await insertMemory('Memory_users_test', {
        title: 'Due',
        content: 'Content',
        owner_id: 'user-1',
        follow_up_at: pastDate(5),
        follow_up_notified_at: null,
        follow_up_targets: [],
        follow_up_failure_count: 0,
        space_ids: [],
        group_ids: [],
      });

      const result = await scanAndNotifyFollowUps({
        weaviateClient: weaviateClient as any,
        eventBus,
        logger,
        collectionEnumerator: async function* () { yield 'Memory_users_test'; },
      });

      expect(result).toEqual({ scanned: 1, notified: 1, failed: 0 });
    });

    it('zero-result scan returns { scanned: 0, notified: 0, failed: 0 }', async () => {
      const result = await scanAndNotifyFollowUps({
        weaviateClient: weaviateClient as any,
        eventBus,
        logger,
        collectionEnumerator: async function* () { yield 'Memory_users_test'; },
      });

      expect(result).toEqual({ scanned: 0, notified: 0, failed: 0 });
    });
  });
});
