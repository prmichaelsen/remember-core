/**
 * Report types for user-generated content flagging (App Store guideline 1.2).
 */

export type ReportStatus = 'pending' | 'reviewed' | 'resolved';

export interface Report {
  id: string;
  reporter_user_id: string;
  memory_id: string;
  reason: string;
  description: string;
  status: ReportStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution: string | null;
}

export interface CreateReportInput {
  reporter_user_id: string;
  memory_id: string;
  reason: string;
  description?: string;
}

export interface ResolveReportInput {
  report_id: string;
  resolved_by: string;
  resolution: string;
  status?: 'reviewed' | 'resolved';
}
