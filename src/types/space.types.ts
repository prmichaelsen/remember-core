/**
 * Space Memory type definitions for remember-core.
 * Ported from remember-mcp/src/types/space-memory.ts
 *
 * Space memories are memories published to shared collections
 * where they can be discovered by other users.
 */

import type { Memory } from './memory.types.js';
import type { SearchOptions, SearchResult } from './search.types.js';

/**
 * Space memory - a memory published to a shared space.
 * Extends Memory with additional fields for attribution and discovery.
 */
export interface SpaceMemory extends Omit<Memory, 'user_id' | 'doc_type'> {
  /**
   * Spaces this memory is published to (snake_case array).
   * Examples: ['the_void'], ['dogs', 'cats'], ['the_void', 'dogs']
   *
   * A memory can belong to multiple spaces simultaneously.
   */
  spaces: string[];

  /**
   * Original author's user_id (for permissions).
   * This is private and not shown publicly.
   */
  author_id: string;

  /**
   * Optional ghost profile ID for pseudonymous publishing.
   * If present, memory is attributed to ghost instead of user.
   */
  ghost_id?: string;

  /**
   * When the memory was published to the space.
   */
  published_at: string;

  /**
   * How many times this memory has been discovered/viewed.
   */
  discovery_count: number;

  /**
   * Attribution type.
   * - 'user': Published as the user (shows author_id)
   * - 'ghost': Published as a ghost (shows ghost_id)
   */
  attribution: 'user' | 'ghost';

  /**
   * Document type discriminator.
   * Always 'space_memory' for space memories.
   */
  doc_type: 'space_memory';

  // Soft Delete Fields (inherited from Memory, but explicitly typed here)
  deleted_at?: Date | null;
  deleted_by?: string;
  deletion_reason?: string;
}

/**
 * Search options for space memories.
 * Same as SearchOptions but for space collections.
 */
export interface SpaceSearchOptions extends Omit<SearchOptions, 'include_relationships'> {
  /** Space to search */
  space: string;
}

/**
 * Search result for space memories.
 */
export interface SpaceSearchResult extends Omit<SearchResult, 'memories' | 'relationships'> {
  /** Found space memories */
  space_memories: SpaceMemory[];
}

/**
 * Supported space IDs
 */
export type SpaceId =
  | 'the_void'
  | 'profiles'
  | 'ghosts';

/**
 * Space display names mapped to IDs
 */
export const SPACE_DISPLAY_NAMES: Record<SpaceId, string> = {
  the_void: 'The Void',
  profiles: 'Profiles',
  ghosts: 'Ghosts',
};

/**
 * Supported spaces constant
 */
export const SUPPORTED_SPACES: SpaceId[] = [
  'the_void',
  'profiles',
  'ghosts',
];

/**
 * Content type restrictions per space.
 * Spaces listed here only accept memories with the specified content_type.
 * Spaces not listed accept any content_type.
 */
export const SPACE_CONTENT_TYPE_RESTRICTIONS: Partial<Record<SpaceId, string>> = {
  profiles: 'profile',
  ghosts: 'ghost',
};

/**
 * Space descriptions for discovery via the 'spaces' collection.
 * Each space should have a corresponding memory published to the 'spaces' space
 * so users can browse and discover available spaces from the GUI.
 */
export const SPACE_DESCRIPTIONS: Record<SpaceId, string> = {
  the_void: 'The default public space. Share anything — thoughts, notes, ideas, and everything in between.',
  profiles: 'User profiles. Discover people and learn about members of the community.',
  ghosts: 'Ghost personas. Discover AI-mediated personas for cross-user interactions.',
};
