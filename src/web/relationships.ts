// src/web/relationships.ts
// Relationship CRUD + search use cases — wraps RelationshipService with Result<T, E>

import type { WebSDKContext } from './context.js';
import type { WebSDKError } from './errors.js';
import type { Result } from './result.js';
import { ok, err } from './result.js';
import { internal, validation } from './errors.js';
import type {
  CreateRelationshipInput,
  SearchRelationshipInput,
  UpdateRelationshipInput,
  DeleteRelationshipInput,
} from '../services/relationship.service.js';
import type { PaginatedResult, RelationshipSearchResult } from './types.js';
import { paginated } from './types.js';

// Re-export input types for convenience
export type {
  CreateRelationshipInput,
  SearchRelationshipInput,
  UpdateRelationshipInput,
  DeleteRelationshipInput,
};

// ─── Create ───────────────────────────────────────────────────────────

export async function createRelationship(
  ctx: WebSDKContext,
  input: CreateRelationshipInput,
): Promise<Result<{ relationship_id: string; memory_ids: string[]; created_at: string }>> {
  if (!ctx.relationshipService) {
    return err(validation('RelationshipService not available in context'));
  }
  try {
    const result = await ctx.relationshipService.create(input);
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Search ──────────────────────────────────────────────────────────

export async function searchRelationships(
  ctx: WebSDKContext,
  input: SearchRelationshipInput,
): Promise<Result<PaginatedResult<RelationshipSearchResult>>> {
  if (!ctx.relationshipService) {
    return err(validation('RelationshipService not available in context'));
  }
  try {
    const result = await ctx.relationshipService.search(input);
    const items: RelationshipSearchResult[] = result.relationships.map(toRelationshipSearchResult);
    return ok(paginated(items, result.total, result.limit, result.offset));
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Update ──────────────────────────────────────────────────────────

export async function updateRelationship(
  ctx: WebSDKContext,
  input: UpdateRelationshipInput,
): Promise<Result<{ relationship_id: string; updated_at: string; version: number; updated_fields: string[] }>> {
  if (!ctx.relationshipService) {
    return err(validation('RelationshipService not available in context'));
  }
  try {
    const result = await ctx.relationshipService.update(input);
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Delete ──────────────────────────────────────────────────────────

export async function deleteRelationship(
  ctx: WebSDKContext,
  input: DeleteRelationshipInput,
): Promise<Result<{ relationship_id: string; memories_updated: number }>> {
  if (!ctx.relationshipService) {
    return err(validation('RelationshipService not available in context'));
  }
  try {
    const result = await ctx.relationshipService.delete(input);
    return ok(result);
  } catch (e) {
    return err(wrapError(e));
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function toRelationshipSearchResult(raw: Record<string, unknown>): RelationshipSearchResult {
  return {
    relationship_id: (raw.id ?? raw.relationship_id ?? '') as string,
    relationship_type: (raw.relationship_type ?? '') as string,
    observation: (raw.observation ?? '') as string,
    memory_ids: (raw.related_memory_ids ?? raw.memory_ids ?? []) as string[],
    strength: (raw.strength ?? 0.5) as number,
    confidence: (raw.confidence ?? 1.0) as number,
    tags: (raw.tags ?? []) as string[],
    created_at: (raw.created_at ?? '') as string,
    updated_at: (raw.updated_at ?? '') as string,
  };
}

function wrapError(e: unknown): WebSDKError {
  const message = e instanceof Error ? e.message : String(e);
  return internal(message);
}
