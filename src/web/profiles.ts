// src/web/profiles.ts
// Profile compound use cases — combine memory CRUD + space publishing into single calls

import type { WebSDKContext } from './context.js';
import type { WebSDKError } from './errors.js';
import type { Result } from './result.js';
import { ok, err } from './result.js';
import { internal, conflict } from './errors.js';
import { publishToSpace } from './spaces.js';
import { retractFromSpace, reviseInSpace } from './spaces.js';
import type { PaginatedResult, ProfileSearchResult } from './types.js';
import { paginated } from './types.js';

const PROFILES_SPACE = 'profiles';

// ─── Create and Publish Profile ───────────────────────────────────────

/**
 * Create a profile memory and publish it to the 'profiles' space in one call.
 * Enforces singleton: one profile per user.
 */
export async function createAndPublishProfile(
  ctx: WebSDKContext,
  input: {
    display_name: string;
    bio?: string;
    tags?: string[];
  },
): Promise<Result<{ memory_id: string; space_id: string; composite_id?: string }>> {
  try {
    // Singleton check: search for existing profile
    const existing = await ctx.spaceService.search({
      query: ctx.userId,
      spaces: [PROFILES_SPACE],
      content_type: 'profile',
      limit: 1,
    });
    if (existing.memories.length > 0) {
      return err(conflict('User already has a published profile. Use updateAndRepublishProfile instead.'));
    }

    // Build profile content
    const content = buildProfileContent(input.display_name, input.bio, input.tags);

    // Create memory
    const memory = await ctx.memoryService.create({
      content,
      type: 'profile' as any,
      tags: input.tags ?? [],
    });

    // Publish to profiles space (auto-confirmed)
    const publishResult = await publishToSpace(ctx, {
      memory_id: memory.memory_id,
      spaces: [PROFILES_SPACE],
    });

    if (!publishResult.ok) {
      return err(publishResult.error);
    }

    return ok({
      memory_id: memory.memory_id,
      space_id: PROFILES_SPACE,
      composite_id: publishResult.data.composite_id,
    });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Search Profiles ──────────────────────────────────────────────────

export async function searchProfiles(
  ctx: WebSDKContext,
  input: {
    query: string;
    limit?: number;
    offset?: number;
  },
): Promise<Result<PaginatedResult<ProfileSearchResult>>> {
  try {
    const limit = input.limit ?? 10;
    const offset = input.offset ?? 0;

    const result = await ctx.spaceService.search({
      query: input.query,
      spaces: [PROFILES_SPACE],
      content_type: 'profile',
      limit,
      offset,
    });

    const items: ProfileSearchResult[] = result.memories.map((raw) => {
      const compositeId = (raw.composite_id ?? '') as string;
      // Extract user_id from composite ID format: space:user_id:memory_id
      const parts = compositeId.split(':');
      const userId = parts.length >= 2 ? parts[1] : (raw.user_id ?? raw.author_id ?? '') as string;

      return {
        user_id: userId,
        display_name: extractDisplayName(raw),
        bio: extractBio(raw),
        tags: (raw.tags ?? []) as string[],
        similarity: 0, // space search doesn't return similarity
        memory_id: (raw.id ?? raw.memory_id ?? '') as string,
        composite_id: compositeId,
      };
    });

    return ok(paginated(items, result.total, limit, offset));
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Retract Profile ──────────────────────────────────────────────────

export async function retractProfile(
  ctx: WebSDKContext,
  input: { memory_id: string },
): Promise<Result<{ retracted: true }>> {
  try {
    const result = await retractFromSpace(ctx, {
      memory_id: input.memory_id,
      spaces: [PROFILES_SPACE],
    });

    if (!result.ok) {
      return err(result.error);
    }

    return ok({ retracted: true });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Update and Republish Profile ─────────────────────────────────────

export async function updateAndRepublishProfile(
  ctx: WebSDKContext,
  input: {
    memory_id: string;
    display_name?: string;
    bio?: string;
    tags?: string[];
  },
): Promise<Result<{ memory_id: string; composite_id?: string }>> {
  try {
    // Build updated content
    const updateFields: Record<string, unknown> = {};
    if (input.display_name || input.bio) {
      updateFields.content = buildProfileContent(
        input.display_name ?? '',
        input.bio,
        input.tags,
      );
    }
    if (input.tags) {
      updateFields.tags = input.tags;
    }

    // Update memory
    await ctx.memoryService.update({
      memory_id: input.memory_id,
      content: updateFields.content as string | undefined,
      tags: updateFields.tags as string[] | undefined,
    });

    // Revise in profiles space (auto-confirmed)
    const reviseResult = await reviseInSpace(ctx, { memory_id: input.memory_id });

    return ok({
      memory_id: input.memory_id,
      composite_id: reviseResult.ok ? undefined : undefined, // revise doesn't return composite_id
    });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function buildProfileContent(displayName: string, bio?: string, tags?: string[]): string {
  const parts = [`Name: ${displayName}`];
  if (bio) parts.push(`Bio: ${bio}`);
  if (tags && tags.length > 0) parts.push(`Tags: ${tags.join(', ')}`);
  return parts.join('\n');
}

function extractDisplayName(raw: Record<string, unknown>): string {
  const content = (raw.content ?? '') as string;
  const match = content.match(/^Name:\s*(.+)/m);
  return match ? match[1].trim() : (raw.title ?? '') as string;
}

function extractBio(raw: Record<string, unknown>): string | undefined {
  const content = (raw.content ?? '') as string;
  const match = content.match(/^Bio:\s*(.+)/m);
  return match ? match[1].trim() : undefined;
}

function wrapError(e: unknown): WebSDKError {
  const message = e instanceof Error ? e.message : String(e);
  return internal(message);
}
