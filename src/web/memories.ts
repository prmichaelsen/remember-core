// src/web/memories.ts
// Memory CRUD + search use cases — wraps MemoryService with Result<T, E>

import type { WebSDKContext } from './context.js';
import type { WebSDKError } from './errors.js';
import type { Result } from './result.js';
import { ok, err } from './result.js';
import { internal } from './errors.js';
import type {
  CreateMemoryInput,
  SearchMemoryInput,
  FindSimilarInput,
  QueryMemoryInput,
  UpdateMemoryInput,
  DeleteMemoryInput,
} from '../services/memory.service.js';
import type {
  PaginatedResult,
  MemorySearchResult,
  SimilarMemory,
  RelevantMemory,
} from './types.js';
import { paginated } from './types.js';

// Re-export input types for convenience
export type {
  CreateMemoryInput,
  SearchMemoryInput,
  FindSimilarInput,
  QueryMemoryInput,
  UpdateMemoryInput,
  DeleteMemoryInput,
};

// ─── Create ───────────────────────────────────────────────────────────

export async function createMemory(
  ctx: WebSDKContext,
  input: CreateMemoryInput,
): Promise<Result<{ memory_id: string; created_at: string }>> {
  try {
    const result = await ctx.memoryService.create(input);
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Search (hybrid) ─────────────────────────────────────────────────

export async function searchMemories(
  ctx: WebSDKContext,
  input: Omit<SearchMemoryInput, 'ghost_context'>,
): Promise<Result<PaginatedResult<MemorySearchResult>>> {
  try {
    const result = await ctx.memoryService.search(input);
    const items: MemorySearchResult[] = result.memories.map(toMemorySearchResult);
    return ok(paginated(items, result.total, result.limit, result.offset));
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Find Similar (vector) ───────────────────────────────────────────

export async function findSimilarMemories(
  ctx: WebSDKContext,
  input: Omit<FindSimilarInput, 'ghost_context'>,
): Promise<Result<{ similar_memories: SimilarMemory[]; total: number }>> {
  try {
    const result = await ctx.memoryService.findSimilar(input);
    const similar_memories: SimilarMemory[] = result.similar_memories.map((m) => ({
      ...toMemorySearchResult(m),
      similarity: m.similarity,
    }));
    return ok({ similar_memories, total: result.total });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Query (semantic / nearText) ──────────────────────────────────────

export async function queryMemories(
  ctx: WebSDKContext,
  input: Omit<QueryMemoryInput, 'ghost_context'>,
): Promise<Result<{ memories: RelevantMemory[]; total: number }>> {
  try {
    const result = await ctx.memoryService.query(input);
    const memories: RelevantMemory[] = result.memories.map((m) => ({
      ...toMemorySearchResult(m),
      relevance: m.relevance,
    }));
    return ok({ memories, total: result.total });
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Update ───────────────────────────────────────────────────────────

export async function updateMemory(
  ctx: WebSDKContext,
  input: UpdateMemoryInput,
): Promise<Result<{ memory_id: string; updated_at: string; version: number; updated_fields: string[] }>> {
  try {
    const result = await ctx.memoryService.update(input);
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Delete (soft) ───────────────────────────────────────────────────

export async function deleteMemory(
  ctx: WebSDKContext,
  input: DeleteMemoryInput,
): Promise<Result<{ memory_id: string; deleted_at: string; orphaned_relationship_ids: string[] }>> {
  try {
    const result = await ctx.memoryService.delete(input);
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function toMemorySearchResult(raw: Record<string, unknown>): MemorySearchResult {
  return {
    memory_id: (raw.id ?? raw.memory_id ?? '') as string,
    content: (raw.content ?? '') as string,
    content_type: (raw.content_type ?? 'general') as string,
    tags: (raw.tags ?? []) as string[],
    weight: (raw.weight ?? raw.computed_weight ?? 0.5) as number,
    trust_score: (raw.trust_score ?? 0.25) as number,
    created_at: (raw.created_at ?? '') as string,
    updated_at: (raw.updated_at ?? '') as string,
  };
}

function wrapError(e: unknown): WebSDKError {
  const message = e instanceof Error ? e.message : String(e);
  return internal(message);
}
