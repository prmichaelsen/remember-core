/**
 * Ghost Config Handler — orchestration layer for ghost config operations.
 *
 * Thin business logic layer that validates inputs and delegates to
 * GhostConfigService functions. Separates orchestration from storage.
 *
 * Ported from remember-mcp/src/tools/ghost-config.ts (business logic only).
 */

import type { Logger } from '../utils/logger.js';
import type { GhostConfig } from '../types/ghost-config.types.js';
import {
  getGhostConfig,
  setGhostConfigFields,
  setUserTrust,
  removeUserTrust,
  blockUser,
  unblockUser,
  validateGhostConfigUpdate,
} from './ghost-config.service.js';

const SERVICE = 'GhostConfigHandler';

export interface GhostConfigResult {
  success: boolean;
  config?: GhostConfig;
  message: string;
}

export interface TrustResult {
  success: boolean;
  message: string;
}

/**
 * Get a user's ghost configuration.
 */
export async function handleGetConfig(
  userId: string,
  logger?: Logger,
): Promise<GhostConfigResult> {
  const config = await getGhostConfig(userId, logger);

  logger?.debug('Ghost config retrieved', { service: SERVICE, userId });

  return {
    success: true,
    config,
    message: config.enabled
      ? 'Ghost mode is enabled.'
      : 'Ghost mode is disabled.',
  };
}

/**
 * Update a user's ghost configuration.
 * Validates all fields before persisting.
 */
export async function handleUpdateConfig(
  userId: string,
  updates: Partial<GhostConfig>,
  logger?: Logger,
): Promise<GhostConfigResult> {
  // Validate before persisting
  validateGhostConfigUpdate(updates);

  const config = await setGhostConfigFields(userId, updates, logger);

  logger?.info('Ghost config updated via handler', {
    service: SERVICE,
    userId,
    updatedKeys: Object.keys(updates),
  });

  return {
    success: true,
    config,
    message: `Ghost config updated: ${Object.keys(updates).join(', ')}`,
  };
}

/**
 * Set trust level for a specific user.
 * Validates trust range [0, 1] before persisting.
 */
export async function handleSetTrust(
  ownerId: string,
  accessorId: string,
  level: number,
  logger?: Logger,
): Promise<TrustResult> {
  if (ownerId === accessorId) {
    return { success: false, message: 'Cannot set trust level for yourself.' };
  }

  if (level < 0 || level > 1) {
    return { success: false, message: `Trust level must be between 0 and 1, got ${level}.` };
  }

  await setUserTrust(ownerId, accessorId, level, logger);

  logger?.info('Trust level set via handler', {
    service: SERVICE,
    ownerId,
    accessorId,
    level,
  });

  return {
    success: true,
    message: `Trust level for user ${accessorId} set to ${level}.`,
  };
}

/**
 * Remove trust level override for a specific user (reverts to default).
 */
export async function handleRemoveTrust(
  ownerId: string,
  accessorId: string,
  logger?: Logger,
): Promise<TrustResult> {
  await removeUserTrust(ownerId, accessorId, logger);

  return {
    success: true,
    message: `Trust override for user ${accessorId} removed.`,
  };
}

/**
 * Block a user from ghost access.
 */
export async function handleBlockUser(
  ownerId: string,
  targetId: string,
  logger?: Logger,
): Promise<TrustResult> {
  if (ownerId === targetId) {
    return { success: false, message: 'Cannot block yourself.' };
  }

  await blockUser(ownerId, targetId, logger);

  return {
    success: true,
    message: `User ${targetId} blocked from ghost access.`,
  };
}

/**
 * Unblock a user from ghost access.
 */
export async function handleUnblockUser(
  ownerId: string,
  targetId: string,
  logger?: Logger,
): Promise<TrustResult> {
  await unblockUser(ownerId, targetId, logger);

  return {
    success: true,
    message: `User ${targetId} unblocked from ghost access.`,
  };
}
