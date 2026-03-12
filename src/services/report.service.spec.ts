import { ReportService } from './report.service.js';
import type { Logger } from '../utils/logger.js';
import type { Report } from '../types/report.types.js';

// Mock Firestore operations
const store = new Map<string, Record<string, unknown>>();

jest.mock('../database/firestore/init.js', () => ({
  getDocument: jest.fn(async (_path: string, docId: string) => {
    for (const [key, val] of store.entries()) {
      if (key.endsWith(`/${docId}`)) return val;
    }
    return null;
  }),
  setDocument: jest.fn(async (path: string, docId: string, data: Record<string, unknown>) => {
    store.set(`${path}/${docId}`, { ...data });
  }),
  updateDocument: jest.fn(async (path: string, docId: string, updates: Record<string, unknown>) => {
    const key = `${path}/${docId}`;
    const existing = store.get(key);
    if (existing) {
      store.set(key, { ...existing, ...updates });
    }
  }),
  queryDocuments: jest.fn(async (path: string, opts: any) => {
    const results: { id: string; data: Record<string, unknown> }[] = [];
    for (const [key, val] of store.entries()) {
      if (!key.startsWith(path + '/')) continue;
      let match = true;
      for (const where of opts?.where || []) {
        if (val[where.field] !== where.value) {
          match = false;
          break;
        }
      }
      if (match) {
        results.push({ id: val.id as string, data: val });
      }
      if (opts?.limit && results.length >= opts.limit) break;
    }
    return results;
  }),
}));

function createMockLogger(): jest.Mocked<Logger> {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

describe('ReportService', () => {
  let service: ReportService;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    store.clear();
    logger = createMockLogger();
    service = new ReportService(logger);
  });

  describe('create', () => {
    it('creates a report with pending status', async () => {
      const report = await service.create({
        reporter_user_id: 'user-1',
        memory_id: 'mem-1',
        reason: 'spam',
        description: 'This is spam content',
      });

      expect(report.id).toBeDefined();
      expect(report.reporter_user_id).toBe('user-1');
      expect(report.memory_id).toBe('mem-1');
      expect(report.reason).toBe('spam');
      expect(report.description).toBe('This is spam content');
      expect(report.status).toBe('pending');
      expect(report.created_at).toBeDefined();
      expect(report.resolved_at).toBeNull();
      expect(report.resolved_by).toBeNull();
      expect(report.resolution).toBeNull();
    });

    it('defaults description to empty string', async () => {
      const report = await service.create({
        reporter_user_id: 'user-1',
        memory_id: 'mem-1',
        reason: 'offensive',
      });

      expect(report.description).toBe('');
    });

    it('writes to both global and user-scoped collections', async () => {
      const report = await service.create({
        reporter_user_id: 'user-1',
        memory_id: 'mem-1',
        reason: 'spam',
      });

      // Should be retrievable by ID (global collection)
      const fetched = await service.getById(report.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(report.id);
    });
  });

  describe('getById', () => {
    it('returns null for non-existent report', async () => {
      const result = await service.getById('non-existent');
      expect(result).toBeNull();
    });

    it('returns the report when it exists', async () => {
      const report = await service.create({
        reporter_user_id: 'user-1',
        memory_id: 'mem-1',
        reason: 'harassment',
      });

      const fetched = await service.getById(report.id);
      expect(fetched!.reason).toBe('harassment');
    });
  });

  describe('listByReporter', () => {
    it('returns reports filed by a specific user', async () => {
      await service.create({ reporter_user_id: 'user-1', memory_id: 'mem-1', reason: 'spam' });
      await service.create({ reporter_user_id: 'user-1', memory_id: 'mem-2', reason: 'offensive' });
      await service.create({ reporter_user_id: 'user-2', memory_id: 'mem-3', reason: 'spam' });

      const reports = await service.listByReporter('user-1');
      expect(reports.length).toBe(2);
      expect(reports.every((r) => r.reporter_user_id === 'user-1')).toBe(true);
    });
  });

  describe('listByMemory', () => {
    it('returns reports for a specific memory', async () => {
      await service.create({ reporter_user_id: 'user-1', memory_id: 'mem-1', reason: 'spam' });
      await service.create({ reporter_user_id: 'user-2', memory_id: 'mem-1', reason: 'offensive' });
      await service.create({ reporter_user_id: 'user-3', memory_id: 'mem-2', reason: 'spam' });

      const reports = await service.listByMemory('mem-1');
      expect(reports.length).toBe(2);
      expect(reports.every((r) => r.memory_id === 'mem-1')).toBe(true);
    });
  });

  describe('listPending', () => {
    it('returns only pending reports', async () => {
      const report1 = await service.create({ reporter_user_id: 'user-1', memory_id: 'mem-1', reason: 'spam' });
      await service.create({ reporter_user_id: 'user-2', memory_id: 'mem-2', reason: 'offensive' });

      // Resolve one
      await service.resolve({ report_id: report1.id, resolved_by: 'admin-1', resolution: 'dismissed' });

      const pending = await service.listPending();
      expect(pending.length).toBe(1);
      expect(pending[0].status).toBe('pending');
    });
  });

  describe('resolve', () => {
    it('resolves a report', async () => {
      const report = await service.create({
        reporter_user_id: 'user-1',
        memory_id: 'mem-1',
        reason: 'spam',
      });

      const resolved = await service.resolve({
        report_id: report.id,
        resolved_by: 'admin-1',
        resolution: 'Content removed',
      });

      expect(resolved.status).toBe('resolved');
      expect(resolved.resolved_by).toBe('admin-1');
      expect(resolved.resolution).toBe('Content removed');
      expect(resolved.resolved_at).toBeDefined();
    });

    it('supports reviewed status', async () => {
      const report = await service.create({
        reporter_user_id: 'user-1',
        memory_id: 'mem-1',
        reason: 'spam',
      });

      const resolved = await service.resolve({
        report_id: report.id,
        resolved_by: 'admin-1',
        resolution: 'Under review',
        status: 'reviewed',
      });

      expect(resolved.status).toBe('reviewed');
    });

    it('throws for non-existent report', async () => {
      await expect(
        service.resolve({ report_id: 'fake', resolved_by: 'admin-1', resolution: 'n/a' }),
      ).rejects.toThrow('Report not found: fake');
    });
  });
});
