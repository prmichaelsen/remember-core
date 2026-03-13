/**
 * Core Memory and Relationship types for remember-core.
 * Ported from remember-mcp/src/types/memory.ts
 */

import type { Location, MemoryContext } from './context.types.js';
import type { TrustLevel } from './trust.types.js';

/**
 * Source of a relationship — who/what created it.
 * - 'user': manually created by user
 * - 'rem': auto-discovered by REM background engine
 * - 'rule': created by a rule/automation
 */
export type RelationshipSource = 'user' | 'rem' | 'rule';

/**
 * Content types for memories.
 * Based on remember-mcp content-types-expansion design.
 */
export type ContentType =
  // Core types
  | 'code'
  | 'note'
  | 'documentation'
  | 'reference'
  // Task & Planning
  | 'todo'
  | 'checklist'
  | 'project'
  | 'goal'
  | 'habit'
  // Communication
  | 'email'
  | 'conversation'
  | 'meeting'
  | 'person'
  // Content & Media
  | 'article'
  | 'webpage'
  | 'social'
  | 'image'
  | 'video'
  | 'audio'
  | 'song'
  | 'transcript'
  | 'presentation'
  | 'spreadsheet'
  | 'pdf'
  // Creative
  | 'screenplay'
  | 'recipe'
  | 'idea'
  | 'quote'
  | 'poetry'
  // Personal
  | 'journal'
  | 'memory'
  | 'event'
  // Organizational
  | 'bookmark'
  | 'form'
  | 'location'
  // Business
  | 'invoice'
  | 'contract'
  // System
  | 'system'
  | 'action'
  | 'audit'
  | 'history'
  // Cross-user & Threading
  | 'ghost'
  | 'comment'
  // Profile
  | 'profile'
  // Agent
  | 'agent'
  // REM-generated
  | 'rem';

/**
 * Core Memory interface.
 * Stored in per-user Weaviate collections (Memory_users_{userId}).
 */
export interface Memory {
  // Core Identity
  id: string; // UUID from Weaviate
  user_id: string;
  doc_type: 'memory'; // Discriminator for unified collection

  // Content
  content: string; // Main memory content (vectorized)
  title?: string;
  summary?: string;
  type: ContentType;

  // Significance & Trust
  weight: number; // 0-1, significance/priority
  trust: TrustLevel; // 1-5 integer, higher = more confidential
  confidence?: number; // 0-1, system confidence in accuracy

  // Location (from platform)
  location: Location;

  // Context
  context: MemoryContext;

  // Relationships
  relationships: string[]; // IDs of relationship documents
  relationship_count: number; // Denormalized count for sorting

  // Rating aggregates (denormalized from Firestore individual ratings)
  rating_sum: number;          // Cumulative sum of all 1-5 ratings
  rating_count: number;        // Number of ratings received
  rating_bayesian: number;     // Pre-computed (rating_sum + 15) / (rating_count + 5)
  rating_avg: number | null;   // Derived: count >= 5 ? sum / count : null

  // Access Tracking (for weight calculation)
  access_count: number;
  last_accessed_at?: string; // ISO 8601 datetime
  access_frequency?: number; // Accesses per day

  // Metadata
  created_at: string; // ISO 8601 datetime
  updated_at: string; // ISO 8601 datetime
  version: number;

  // Organization
  tags: string[];
  category?: string;
  references?: string[]; // Source URLs

  // Template Integration (optional)
  template_id?: string;
  template_version?: string;
  structured_content?: Record<string, unknown>;

  // Computed Weight (for search ranking)
  base_weight: number; // User-specified
  computed_weight?: number; // Calculated with access multipliers

  // Comment/Threading Fields (for threaded discussions in shared spaces)
  parent_id?: string | null; // ID of parent memory or comment (null for top-level)
  thread_root_id?: string | null; // Root memory ID for fetching entire thread (null for top-level)
  moderation_flags?: string[]; // Per-space moderation flags (format: "{space_id}:{flag_type}")

  // Agent Follow-Up Tracking
  follow_up_at?: string; // ISO 8601 datetime — agent follow-up reminder date
  follow_up_notified_at?: string; // ISO 8601 — set after successful webhook delivery
  follow_up_targets?: string[]; // e.g. ["user:abc", "group:xyz"]. Empty = owner only.
  follow_up_failure_count?: number; // Retry counter, skip when >= 3

  // Soft Delete Fields
  deleted_at?: Date | null; // Timestamp when memory was soft-deleted (null = not deleted)
  deleted_by?: string; // User ID who deleted the memory
  deletion_reason?: string; // Optional reason for deletion

  // Organization
  is_user_organized?: boolean; // Whether this memory has been manually organized by the user

  // Publication Tracking (Memory Collection Pattern v2)
  // Managed by remember_publish / remember_retract — do NOT modify directly
  space_ids?: string[]; // Spaces this memory has been published to
  group_ids?: string[]; // Groups this memory has been published to

  // ACL Fields (nullable — null defaults to owner_only semantics)
  write_mode?: string | null; // 'owner_only' | 'group_editors' | 'anyone'
  overwrite_allowed_ids?: string[]; // Per-memory explicit overwrite grants (user IDs)
  last_revised_by?: string | null; // User ID of last reviser (conflict detection)
  owner_id?: string | null; // Supports ownership transfer (null → user_id)

  // Moderation Fields (nullable — null treated as 'approved' for backward compat)
  moderation_status?: string | null; // 'pending' | 'approved' | 'rejected' | 'removed'
  moderated_by?: string | null; // User ID of last moderator action
  moderated_at?: string | null; // ISO 8601 timestamp of last moderation action

}

/**
 * Relationship interface.
 * Stored in same collection as memories with doc_type: "relationship".
 */
export interface Relationship {
  // Core Identity
  id: string;
  user_id: string;
  doc_type: 'relationship'; // Discriminator

  // Connection
  memory_ids: string[]; // 2...N memory IDs
  relationship_type: string; // Free-form: "causes", "contradicts", "inspired_by", etc.

  // Observation
  observation: string; // Description of the connection (vectorized)
  strength: number; // 0-1
  confidence: number; // 0-1

  // Context
  context: MemoryContext;

  // Source
  source: RelationshipSource;

  // Denormalized counts
  member_count?: number; // Number of memory_ids in this relationship

  // Ordering (M77)
  member_order?: Record<string, number>; // memory_id → zero-indexed position

  // Metadata
  created_at: string;
  updated_at: string;
  version: number;
  tags: string[];
}

/**
 * Union type for documents in Memory collection
 */
export type MemoryDocument = Memory | Relationship;

/**
 * Partial memory for updates
 */
export type MemoryUpdate = Partial<Omit<Memory, 'id' | 'user_id' | 'doc_type' | 'created_at' | 'version'>>;

/**
 * Partial relationship for updates
 */
export type RelationshipUpdate = Partial<Omit<Relationship, 'id' | 'user_id' | 'doc_type' | 'created_at' | 'version'>>;

/**
 * Discriminated union for relationship reorder operations (M77).
 */
export type ReorderOperation =
  | { type: 'move_to_index'; memory_id: string; index: number }
  | { type: 'swap'; memory_id_a: string; memory_id_b: string }
  | { type: 'set_order'; ordered_memory_ids: string[] }
  | { type: 'move_before'; memory_id: string; before: string }
  | { type: 'move_after'; memory_id: string; after: string };

/**
 * Input for a relationship reorder request.
 */
export interface ReorderInput {
  relationship_id: string;
  operation: ReorderOperation;
  version: number;
}
