// src/web/spaces.ts
// Space use cases — collapsed confirmations + search/query/moderate

import type { WebSDKContext } from './context.js';
import type { WebSDKError } from './errors.js';
import type { Result } from './result.js';
import { ok, err } from './result.js';
import { internal } from './errors.js';
import type {
  PublishInput,
  RetractInput,
  ReviseInput,
  ModerateInput,
  SearchSpaceInput,
  SearchSpaceResult as SvcSearchSpaceResult,
  QuerySpaceInput,
  QuerySpaceResult as SvcQuerySpaceResult,
  RevisionResult,
  ModerationAction,
} from '../services/space.service.js';
import type { SpaceSearchResult } from './types.js';

// Re-export input types for convenience
export type {
  PublishInput,
  RetractInput,
  ReviseInput,
  ModerateInput,
  SearchSpaceInput,
  QuerySpaceInput,
  ModerationAction,
};

// ─── Publish (auto-confirmed) ─────────────────────────────────────────

export async function publishToSpace(
  ctx: WebSDKContext,
  input: PublishInput,
): Promise<Result<{
  composite_id?: string;
  published_to: string[];
  space_ids: string[];
  group_ids: string[];
  results?: RevisionResult[];
}>> {
  try {
    // Phase 1: generate confirmation token
    const { token } = await ctx.spaceService.publish(input);
    // Phase 2: auto-confirm
    const confirmed = await ctx.spaceService.confirm({ token });
    return ok({
      composite_id: confirmed.composite_id,
      published_to: confirmed.published_to ?? [],
      space_ids: confirmed.space_ids ?? [],
      group_ids: confirmed.group_ids ?? [],
      results: confirmed.results,
    });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Retract (auto-confirmed) ─────────────────────────────────────────

export async function retractFromSpace(
  ctx: WebSDKContext,
  input: RetractInput,
): Promise<Result<{
  retracted_from: string[];
  results?: RevisionResult[];
}>> {
  try {
    const { token } = await ctx.spaceService.retract(input);
    const confirmed = await ctx.spaceService.confirm({ token });
    return ok({
      retracted_from: confirmed.retracted_from ?? [],
      results: confirmed.results,
    });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Revise (auto-confirmed) ──────────────────────────────────────────

export async function reviseInSpace(
  ctx: WebSDKContext,
  input: ReviseInput,
): Promise<Result<{ revised_at?: string; memory_id: string }>> {
  try {
    const { token } = await ctx.spaceService.revise(input);
    const confirmed = await ctx.spaceService.confirm({ token });
    return ok({
      revised_at: confirmed.revised_at,
      memory_id: input.memory_id,
    });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Moderate (no confirmation needed) ────────────────────────────────

export async function moderateSpace(
  ctx: WebSDKContext,
  input: ModerateInput,
): Promise<Result<{
  memory_id: string;
  action: string;
  moderation_status: string;
  moderated_by: string;
  moderated_at: string;
  location: string;
}>> {
  try {
    const result = await ctx.spaceService.moderate(input);
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Search ───────────────────────────────────────────────────────────

export async function searchSpace(
  ctx: WebSDKContext,
  input: SearchSpaceInput,
): Promise<Result<{
  spaces_searched: string[] | 'all_public';
  groups_searched: string[];
  memories: SpaceSearchResult[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}>> {
  try {
    const result = await ctx.spaceService.search(input);
    const memories = result.memories.map(toSpaceSearchResult);
    return ok({
      spaces_searched: result.spaces_searched,
      groups_searched: result.groups_searched,
      memories,
      total: result.total,
      offset: result.offset,
      limit: result.limit,
      hasMore: result.offset + result.limit < result.total,
    });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Query ────────────────────────────────────────────────────────────

export async function querySpace(
  ctx: WebSDKContext,
  input: QuerySpaceInput,
): Promise<Result<{
  question: string;
  spaces_queried: string[];
  memories: SpaceSearchResult[];
  total: number;
}>> {
  try {
    const result = await ctx.spaceService.query(input);
    const memories = result.memories.map(toSpaceSearchResult);
    return ok({
      question: result.question,
      spaces_queried: result.spaces_queried,
      memories,
      total: result.total,
    });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function toSpaceSearchResult(raw: Record<string, unknown>): SpaceSearchResult {
  return {
    memory_id: (raw.id ?? raw.memory_id ?? '') as string,
    content: (raw.content ?? '') as string,
    content_type: (raw.content_type ?? 'general') as string,
    tags: (raw.tags ?? []) as string[],
    weight: (raw.weight ?? raw.computed_weight ?? 0.5) as number,
    trust_score: (raw.trust_score ?? 0.25) as number,
    created_at: (raw.created_at ?? '') as string,
    updated_at: (raw.updated_at ?? '') as string,
    space_id: (raw.space_id ?? '') as string,
    composite_id: (raw.composite_id ?? '') as string,
    author_id: (raw.author_id ?? raw.user_id ?? '') as string,
    moderation_status: (raw.moderation_status ?? 'approved') as string,
  };
}

function wrapError(e: unknown): WebSDKError {
  const message = e instanceof Error ? e.message : String(e);
  return internal(message);
}
