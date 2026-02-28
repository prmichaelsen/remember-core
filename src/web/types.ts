// src/web/types.ts
// Shared types for the web SDK — aligned with OpenAPI schemas

import type { ContentType } from '../types/memory.types.js';

/**
 * Paginated result wrapper — adds hasMore convenience boolean.
 * Matches OpenAPI pagination shape with computed hasMore.
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Construct a PaginatedResult from raw items and pagination params.
 */
export function paginated<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number,
): PaginatedResult<T> {
  return { items, total, limit, offset, hasMore: offset + limit < total };
}

// ─── Memory result types ──────────────────────────────────────────────

export interface MemorySearchResult {
  memory_id: string;
  content: string;
  content_type: ContentType | string;
  tags: string[];
  weight: number;
  trust_score: number;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface SimilarMemory extends MemorySearchResult {
  similarity: number;
}

export interface RelevantMemory extends MemorySearchResult {
  relevance: number;
}

// ─── Relationship result types ────────────────────────────────────────

export interface RelationshipSearchResult {
  relationship_id: string;
  relationship_type: string;
  observation: string;
  memory_ids: string[];
  strength: number;
  confidence: number;
  tags: string[];
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

// ─── Space result types ───────────────────────────────────────────────

export interface SpaceSearchResult extends MemorySearchResult {
  space_id: string;
  composite_id: string;
  author_id: string;
  moderation_status: string;
}

// ─── Profile result types ─────────────────────────────────────────────

export interface ProfileSearchResult {
  user_id: string;
  display_name: string;
  bio?: string;
  tags: string[];
  similarity: number;
  memory_id: string;
  composite_id: string;
}

// ─── Ghost result types ───────────────────────────────────────────────

export interface RedactedMemory {
  memory_id: string;
  trust_tier: 'full_access' | 'partial_access' | 'summary_only' | 'metadata_only' | 'existence_only';
  content: string;
  tags: string[];
  access_level: string;
}
