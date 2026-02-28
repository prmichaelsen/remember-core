// src/web/ghost.ts
// Ghost config, trust management, access checking, and searchAsGhost compound operation

import type { GhostConfig } from '../types/ghost-config.types.js';
import { DEFAULT_GHOST_CONFIG } from '../types/ghost-config.types.js';
import type { WebSDKContext } from './context.js';
import type { WebSDKError } from './errors.js';
import type { Result } from './result.js';
import { ok, err } from './result.js';
import { internal } from './errors.js';
import {
  handleGetConfig,
  handleUpdateConfig,
  handleSetTrust,
  handleRemoveTrust,
  handleBlockUser,
  handleUnblockUser,
} from '../services/ghost-config-handler.service.js';
import { resolveAccessorTrustLevel } from '../services/access-control.service.js';
import { formatMemoryForPrompt, getTrustLevelLabel } from '../services/trust-enforcement.service.js';
import type { PaginatedResult, RedactedMemory } from './types.js';
import { paginated } from './types.js';
import type { Memory } from '../types/memory.types.js';

// ─── Ghost Config Management ──────────────────────────────────────────

export async function getGhostConfig(
  ctx: WebSDKContext,
): Promise<Result<{ success: boolean; config: GhostConfig; message: string }>> {
  try {
    const result = await handleGetConfig(ctx.userId, ctx.logger);
    return ok({
      success: result.success,
      config: result.config ?? DEFAULT_GHOST_CONFIG,
      message: result.message,
    });
  } catch (e) {
    return err(wrapError(e));
  }
}

export async function updateGhostConfig(
  ctx: WebSDKContext,
  input: {
    enabled?: boolean;
    public_ghost_enabled?: boolean;
    default_friend_trust?: number;
    default_public_trust?: number;
    enforcement_mode?: 'query' | 'prompt' | 'hybrid';
  },
): Promise<Result<{ success: boolean; config: GhostConfig; message: string }>> {
  try {
    const result = await handleUpdateConfig(ctx.userId, input, ctx.logger);
    return ok({
      success: result.success,
      config: result.config ?? DEFAULT_GHOST_CONFIG,
      message: result.message,
    });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Trust Management ─────────────────────────────────────────────────

export async function setUserTrust(
  ctx: WebSDKContext,
  input: { target_user_id: string; trust_level: number },
): Promise<Result<{ success: boolean; message: string }>> {
  try {
    const result = await handleSetTrust(ctx.userId, input.target_user_id, input.trust_level, ctx.logger);
    if (!result.success) {
      return err(internal(result.message));
    }
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

export async function removeUserTrust(
  ctx: WebSDKContext,
  input: { target_user_id: string },
): Promise<Result<{ success: boolean; message: string }>> {
  try {
    const result = await handleRemoveTrust(ctx.userId, input.target_user_id, ctx.logger);
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

export async function blockUser(
  ctx: WebSDKContext,
  input: { target_user_id: string },
): Promise<Result<{ success: boolean; message: string }>> {
  try {
    const result = await handleBlockUser(ctx.userId, input.target_user_id, ctx.logger);
    if (!result.success) {
      return err(internal(result.message));
    }
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

export async function unblockUser(
  ctx: WebSDKContext,
  input: { target_user_id: string },
): Promise<Result<{ success: boolean; message: string }>> {
  try {
    const result = await handleUnblockUser(ctx.userId, input.target_user_id, ctx.logger);
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Access Checking ──────────────────────────────────────────────────

export async function checkAccess(
  ctx: WebSDKContext,
  input: { memory_id: string; accessor_user_id: string },
): Promise<Result<{ accessible: boolean; trust_tier: string; reason?: string }>> {
  try {
    // Resolve ghost config for the memory owner (ctx.userId owns the memories)
    const ghostConfig = await ctx.ghostConfigProvider.getGhostConfig(ctx.userId);
    if (!ghostConfig || !ghostConfig.enabled) {
      return ok({ accessible: true, trust_tier: 'full_access', reason: 'Ghost mode disabled' });
    }

    const trustLevel = resolveAccessorTrustLevel(ghostConfig, input.accessor_user_id);
    const tier = getTrustLevelLabel(trustLevel);

    // Check if user is blocked
    const block = await ctx.escalationStore.getBlock(ctx.userId, input.accessor_user_id, input.memory_id);
    if (block) {
      return ok({ accessible: false, trust_tier: 'blocked', reason: 'User is blocked from accessing this memory' });
    }

    return ok({
      accessible: true,
      trust_tier: tier.toLowerCase().replace(/ /g, '_'),
      reason: undefined,
    });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Compound: searchAsGhost ──────────────────────────────────────────

/**
 * Search memories as a ghost user — resolves trust context automatically.
 * Combines: resolve trust level → build ghost_context → search → redact content.
 */
export async function searchAsGhost(
  ctx: WebSDKContext,
  input: {
    owner_user_id: string;
    query: string;
    limit?: number;
    offset?: number;
  },
): Promise<Result<PaginatedResult<RedactedMemory>>> {
  try {
    // 1. Resolve ghost config for the memory owner
    const ghostConfig = await ctx.ghostConfigProvider.getGhostConfig(input.owner_user_id);
    const config = ghostConfig ?? DEFAULT_GHOST_CONFIG;

    // 2. Resolve accessor trust level
    const accessorTrustLevel = resolveAccessorTrustLevel(config, ctx.userId);

    // 3. Search with ghost_context
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;
    const searchResult = await ctx.memoryService.search({
      query: input.query,
      limit,
      offset,
      ghost_context: {
        accessor_trust_level: accessorTrustLevel,
        owner_user_id: input.owner_user_id,
      },
    });

    // 4. Redact content based on trust tier
    const redacted: RedactedMemory[] = searchResult.memories.map((raw) => {
      const formatted = formatMemoryForPrompt(
        raw as unknown as Memory,
        accessorTrustLevel,
        false, // not self-access
      );
      const tier = formatted.trust_tier.toLowerCase().replace(/ /g, '_') as RedactedMemory['trust_tier'];
      return {
        memory_id: formatted.memory_id,
        trust_tier: tier,
        content: formatted.content,
        tags: (raw.tags ?? []) as string[],
        access_level: formatted.trust_tier,
      };
    });

    return ok(paginated(redacted, searchResult.total, limit, offset));
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function wrapError(e: unknown): WebSDKError {
  const message = e instanceof Error ? e.message : String(e);
  return internal(message);
}
