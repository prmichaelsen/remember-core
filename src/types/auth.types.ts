/**
 * Auth types for group membership validation and access control.
 * Ported from remember-mcp/src/types/auth.ts
 *
 * These types define the contract for credentials providers and
 * the AuthContext threaded through tool handlers.
 */

export interface GroupPermissions {
  can_read: boolean;
  can_publish: boolean;
  can_revise: boolean;
  can_propose: boolean;
  can_overwrite: boolean;
  can_comment: boolean;
  can_retract_own: boolean;
  can_retract_any: boolean;
  can_manage_members: boolean;
  can_moderate: boolean;
}

export interface GroupMembership {
  group_id: string;
  permissions: GroupPermissions;
}

export interface UserCredentials {
  user_id: string;
  group_memberships: GroupMembership[];
}

/** Server-resolved ghost mode context for cross-user memory access */
export interface GhostModeContext {
  /** User ID of the ghost owner (whose memories are being accessed) */
  owner_user_id: string;
  /** User ID of the accessor (who is talking to the ghost) */
  accessor_user_id: string;
  /** Resolved trust level for this accessor (0-1) */
  accessor_trust_level: number;
}

export interface AuthContext {
  accessToken: string | null;
  credentials: UserCredentials | null;
  /** Ghost mode context — present when accessing another user's memories via ghost */
  ghostMode?: GhostModeContext;
}

export type WriteMode = 'owner_only' | 'group_editors' | 'anyone';

export interface CredentialsProvider {
  getCredentials(accessToken: string, userId: string): Promise<UserCredentials>;
}
