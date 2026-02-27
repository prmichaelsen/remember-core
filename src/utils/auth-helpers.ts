/**
 * Auth helper utilities for permission checking.
 *
 * Ported from remember-mcp/src/utils/auth-helpers.ts.
 */

import type { AuthContext } from '../types/auth.types.js';

/**
 * Check if the user has can_moderate permission for a specific group.
 *
 * @param authContext - The current auth context (may be undefined if unauthenticated)
 * @param groupId - The group to check moderation permissions for
 * @returns true if user can moderate the specified group
 */
export function canModerate(authContext: AuthContext | undefined, groupId: string): boolean {
  if (!authContext?.credentials) return false;
  const membership = authContext.credentials.group_memberships.find(
    (m) => m.group_id === groupId,
  );
  return membership?.permissions.can_moderate ?? false;
}

/**
 * Check if the user has can_moderate permission for ANY group.
 * Useful for space-level moderation where there's no specific group context.
 *
 * @param authContext - The current auth context (may be undefined if unauthenticated)
 * @returns true if user can moderate at least one group
 */
export function canModerateAny(authContext: AuthContext | undefined): boolean {
  if (!authContext?.credentials) return false;
  return authContext.credentials.group_memberships.some(
    (m) => m.permissions.can_moderate,
  );
}
