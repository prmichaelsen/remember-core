// src/clients/svc/v1/reports.ts
// ReportsResource — 1:1 mirror of /api/svc/v1/reports routes

import type { HttpClient } from '../../http.js';
import type { SdkResponse } from '../../response.js';

export interface CreateReportInput {
  memory_id: string;
  reason: string;
  description?: string;
}

export interface ResolveReportInput {
  resolution: string;
  status?: 'reviewed' | 'resolved';
}

export interface Report {
  id: string;
  reporter_user_id: string;
  memory_id: string;
  reason: string;
  description: string;
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
}

export interface ReportsListResult {
  reports: Report[];
}

export interface ReportsResource {
  create(userId: string, input: CreateReportInput): Promise<SdkResponse<Report>>;
  listMine(userId: string): Promise<SdkResponse<ReportsListResult>>;
  listPending(userId: string, limit?: number): Promise<SdkResponse<ReportsListResult>>;
  get(userId: string, reportId: string): Promise<SdkResponse<Report>>;
  resolve(userId: string, reportId: string, input: ResolveReportInput): Promise<SdkResponse<Report>>;
  listByMemory(userId: string, memoryId: string): Promise<SdkResponse<ReportsListResult>>;
}

export function createReportsResource(http: HttpClient): ReportsResource {
  return {
    create(userId, input) {
      return http.request<Report>('POST', '/api/svc/v1/reports', { userId, body: input });
    },
    listMine(userId) {
      return http.request<ReportsListResult>('GET', '/api/svc/v1/reports', { userId });
    },
    listPending(userId, limit?) {
      const qs = limit ? `?limit=${limit}` : '';
      return http.request<ReportsListResult>('GET', `/api/svc/v1/reports/pending${qs}`, { userId });
    },
    get(userId, reportId) {
      return http.request<Report>('GET', `/api/svc/v1/reports/${reportId}`, { userId });
    },
    resolve(userId, reportId, input) {
      return http.request<Report>('POST', `/api/svc/v1/reports/${reportId}/resolve`, { userId, body: input });
    },
    listByMemory(userId, memoryId) {
      return http.request<ReportsListResult>('GET', `/api/svc/v1/reports/by-memory/${memoryId}`, { userId });
    },
  };
}
