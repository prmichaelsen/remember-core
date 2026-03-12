/**
 * ReportService — Firestore CRUD for content reports (App Store guideline 1.2).
 *
 * Users can flag objectionable content. Moderators can review and resolve reports.
 */

import {
  getDocument,
  setDocument,
  updateDocument,
  queryDocuments,
  type QueryOptions,
} from '../database/firestore/init.js';
import { getReportsPath, getUserReportsPath } from '../database/firestore/paths.js';
import type { Logger } from '../utils/logger.js';
import type { Report, CreateReportInput, ResolveReportInput } from '../types/report.types.js';

export class ReportService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async create(input: CreateReportInput): Promise<Report> {
    const now = new Date().toISOString();
    const id = globalThis.crypto.randomUUID();

    const report: Report = {
      id,
      reporter_user_id: input.reporter_user_id,
      memory_id: input.memory_id,
      reason: input.reason,
      description: input.description ?? '',
      status: 'pending',
      created_at: now,
      resolved_at: null,
      resolved_by: null,
      resolution: null,
    };

    const data = report as unknown as Record<string, unknown>;

    // Write to global reports collection
    await setDocument(getReportsPath(), id, data);

    // Write to user-scoped index for "my reports" queries
    await setDocument(getUserReportsPath(input.reporter_user_id), id, data);

    this.logger.info('Report created', { report_id: id, memory_id: input.memory_id });
    return report;
  }

  async getById(reportId: string): Promise<Report | null> {
    const doc = await getDocument(getReportsPath(), reportId);
    if (!doc) return null;
    return doc as unknown as Report;
  }

  async listByReporter(userId: string): Promise<Report[]> {
    const queryOpts: QueryOptions = {
      orderBy: [{ field: 'created_at', direction: 'DESCENDING' }],
      limit: 100,
    };
    const results = await queryDocuments(getUserReportsPath(userId), queryOpts);
    return results.map((r) => r.data as unknown as Report);
  }

  async listByMemory(memoryId: string): Promise<Report[]> {
    const queryOpts: QueryOptions = {
      where: [{ field: 'memory_id', op: '==', value: memoryId }],
      orderBy: [{ field: 'created_at', direction: 'DESCENDING' }],
      limit: 100,
    };
    const results = await queryDocuments(getReportsPath(), queryOpts);
    return results.map((r) => r.data as unknown as Report);
  }

  async listPending(limit = 50): Promise<Report[]> {
    const queryOpts: QueryOptions = {
      where: [{ field: 'status', op: '==', value: 'pending' }],
      orderBy: [{ field: 'created_at', direction: 'ASCENDING' }],
      limit,
    };
    const results = await queryDocuments(getReportsPath(), queryOpts);
    return results.map((r) => r.data as unknown as Report);
  }

  async resolve(input: ResolveReportInput): Promise<Report> {
    const existing = await this.getById(input.report_id);
    if (!existing) throw new Error(`Report not found: ${input.report_id}`);

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      status: input.status ?? 'resolved',
      resolved_by: input.resolved_by,
      resolution: input.resolution,
      resolved_at: now,
    };

    await updateDocument(getReportsPath(), input.report_id, updates);

    // Update user-scoped copy
    await updateDocument(getUserReportsPath(existing.reporter_user_id), input.report_id, updates);

    const resolved: Report = { ...existing, ...updates } as Report;
    this.logger.info('Report resolved', { report_id: input.report_id, resolution: input.resolution });
    return resolved;
  }
}
