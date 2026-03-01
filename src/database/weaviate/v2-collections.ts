/**
 * Weaviate Schema Definitions for Memory Collection Pattern v2.
 * Ported from remember-mcp/src/schema/v2-collections.ts
 *
 * Defines schemas for the three collection types:
 * 1. Memory_users_{userId} - User's private memories
 * 2. Memory_spaces_public - Shared space memories
 * 3. Memory_groups_{groupId} - Group memories
 */

import { configure } from 'weaviate-client';
import type { WeaviateClient } from 'weaviate-client';

/**
 * Common properties shared across all memory collection types.
 *
 * Note: 'id' is NOT included — it is reserved by Weaviate for the UUID primary key.
 */
const COMMON_MEMORY_PROPERTIES = [
  // Core content
  { name: 'content', dataType: configure.dataType.TEXT },
  { name: 'content_type', dataType: configure.dataType.TEXT },
  { name: 'title', dataType: configure.dataType.TEXT },
  { name: 'summary', dataType: configure.dataType.TEXT },
  { name: 'type', dataType: configure.dataType.TEXT }, // v1 compat (v2: content_type)

  // Tracking arrays (v2 feature)
  { name: 'space_ids', dataType: configure.dataType.TEXT_ARRAY },
  { name: 'group_ids', dataType: configure.dataType.TEXT_ARRAY },

  // Metadata
  { name: 'created_at', dataType: configure.dataType.DATE },
  { name: 'updated_at', dataType: configure.dataType.DATE },
  { name: 'version', dataType: configure.dataType.INT },

  // User context
  { name: 'user_id', dataType: configure.dataType.TEXT },

  // Document type (memory, relationship, comment)
  { name: 'doc_type', dataType: configure.dataType.TEXT },

  // Memory-specific fields
  { name: 'tags', dataType: configure.dataType.TEXT_ARRAY },
  { name: 'weight', dataType: configure.dataType.NUMBER },
  { name: 'trust_score', dataType: configure.dataType.NUMBER },
  { name: 'trust', dataType: configure.dataType.NUMBER }, // v1 compat (v2: trust_score)
  { name: 'base_weight', dataType: configure.dataType.NUMBER },
  { name: 'computed_weight', dataType: configure.dataType.NUMBER },
  { name: 'confidence', dataType: configure.dataType.NUMBER },
  { name: 'strength', dataType: configure.dataType.NUMBER },

  // Location data (v2 names)
  { name: 'location_name', dataType: configure.dataType.TEXT },
  { name: 'location_lat', dataType: configure.dataType.NUMBER },
  { name: 'location_lon', dataType: configure.dataType.NUMBER },
  // Location data (v1 compat)
  { name: 'location_gps_lat', dataType: configure.dataType.NUMBER },
  { name: 'location_gps_lng', dataType: configure.dataType.NUMBER },
  { name: 'location_address', dataType: configure.dataType.TEXT },
  { name: 'location_city', dataType: configure.dataType.TEXT },
  { name: 'location_country', dataType: configure.dataType.TEXT },
  { name: 'location_source', dataType: configure.dataType.TEXT },

  // Locale
  { name: 'locale_language', dataType: configure.dataType.TEXT },
  { name: 'locale_timezone', dataType: configure.dataType.TEXT },

  // Context
  { name: 'context_app', dataType: configure.dataType.TEXT },
  { name: 'context_url', dataType: configure.dataType.TEXT },
  { name: 'context_conversation_id', dataType: configure.dataType.TEXT },
  { name: 'context_summary', dataType: configure.dataType.TEXT },
  { name: 'context_timestamp', dataType: configure.dataType.DATE },

  // Relationships (v2 names)
  { name: 'relationship_ids', dataType: configure.dataType.TEXT_ARRAY },
  { name: 'relationship_type', dataType: configure.dataType.TEXT },
  { name: 'related_memory_ids', dataType: configure.dataType.TEXT_ARRAY },
  { name: 'observation', dataType: configure.dataType.TEXT },
  // Relationships (v1 compat)
  { name: 'relationships', dataType: configure.dataType.TEXT_ARRAY },
  { name: 'memory_ids', dataType: configure.dataType.TEXT_ARRAY },

  // Access tracking
  { name: 'access_count', dataType: configure.dataType.NUMBER },
  { name: 'last_accessed_at', dataType: configure.dataType.DATE },

  // References & templates
  { name: 'references', dataType: configure.dataType.TEXT_ARRAY },
  { name: 'template_id', dataType: configure.dataType.TEXT },

  // Comments (Phase 1)
  { name: 'parent_id', dataType: configure.dataType.TEXT },
  { name: 'thread_root_id', dataType: configure.dataType.TEXT },
  { name: 'moderation_flags', dataType: configure.dataType.TEXT_ARRAY },

  // Soft delete
  { name: 'deleted_at', dataType: configure.dataType.DATE },
  { name: 'deleted_by', dataType: configure.dataType.TEXT },
  { name: 'deletion_reason', dataType: configure.dataType.TEXT },
];

/**
 * Additional properties for published memories (spaces and groups)
 */
const PUBLISHED_MEMORY_PROPERTIES = [
  // Publication metadata
  { name: 'published_at', dataType: configure.dataType.DATE },
  { name: 'revised_at', dataType: configure.dataType.DATE },

  // Attribution
  { name: 'author_id', dataType: configure.dataType.TEXT },
  { name: 'ghost_id', dataType: configure.dataType.TEXT },
  { name: 'attribution', dataType: configure.dataType.TEXT },

  // Discovery
  { name: 'discovery_count', dataType: configure.dataType.INT },

  // Revision tracking
  { name: 'revision_count', dataType: configure.dataType.INT },
  { name: 'original_memory_id', dataType: configure.dataType.TEXT },

  // Moderation (nullable — null defaults to approved)
  { name: 'moderation_status', dataType: configure.dataType.TEXT },
  { name: 'moderated_by', dataType: configure.dataType.TEXT },
  { name: 'moderated_at', dataType: configure.dataType.DATE },

  // Memory-level ACL (nullable — null defaults to owner_only semantics)
  { name: 'write_mode', dataType: configure.dataType.TEXT },
  { name: 'owner_id', dataType: configure.dataType.TEXT },
  { name: 'overwrite_allowed_ids', dataType: configure.dataType.TEXT_ARRAY },
  { name: 'last_revised_by', dataType: configure.dataType.TEXT },

  // Legacy compatibility (deprecated but kept for migration)
  { name: 'spaces', dataType: configure.dataType.TEXT_ARRAY },
  { name: 'space_id', dataType: configure.dataType.TEXT },
  { name: 'space_memory_id', dataType: configure.dataType.TEXT },
];

/**
 * Create schema for a user's private memory collection
 */
export function createUserCollectionSchema(userId: string) {
  const collectionName = `Memory_users_${userId}`;

  return {
    name: collectionName,
    description: `Private memory collection for user: ${userId}`,
    vectorizers: configure.vectorizer.text2VecOpenAI({
      model: 'text-embedding-3-small',
      dimensions: 1536,
      vectorizeCollectionName: false,
    }),
    properties: COMMON_MEMORY_PROPERTIES,
    invertedIndex: configure.invertedIndex({
      indexNullState: true,
      indexPropertyLength: true,
      indexTimestamps: true,
    }),
  };
}

/**
 * Create schema for the shared spaces collection
 */
export function createSpaceCollectionSchema() {
  const collectionName = 'Memory_spaces_public';

  return {
    name: collectionName,
    description: 'Shared memory collection for all public spaces',
    vectorizers: configure.vectorizer.text2VecOpenAI({
      model: 'text-embedding-3-small',
      dimensions: 1536,
      vectorizeCollectionName: false,
    }),
    properties: [
      ...COMMON_MEMORY_PROPERTIES,
      ...PUBLISHED_MEMORY_PROPERTIES,
    ],
    invertedIndex: configure.invertedIndex({
      indexNullState: true,
      indexPropertyLength: true,
      indexTimestamps: true,
    }),
  };
}

/**
 * Create schema for a group memory collection
 */
export function createGroupCollectionSchema(groupId: string) {
  const collectionName = `Memory_groups_${groupId}`;

  return {
    name: collectionName,
    description: `Group memory collection for group: ${groupId}`,
    vectorizers: configure.vectorizer.text2VecOpenAI({
      model: 'text-embedding-3-small',
      dimensions: 1536,
      vectorizeCollectionName: false,
    }),
    properties: [
      ...COMMON_MEMORY_PROPERTIES,
      ...PUBLISHED_MEMORY_PROPERTIES,
    ],
    invertedIndex: configure.invertedIndex({
      indexNullState: true,
      indexPropertyLength: true,
      indexTimestamps: true,
    }),
  };
}

/**
 * Reconcile missing properties on an existing collection.
 * Compares the expected properties against the collection's current schema
 * and adds any that are missing via collection.config.addProperty().
 *
 * @returns The number of properties added.
 */
export async function reconcileCollectionProperties(
  client: WeaviateClient,
  collectionName: string,
  expectedProperties: Array<{ name: string; dataType: string }>,
): Promise<number> {
  const collection = client.collections.get(collectionName);
  const config = await collection.config.get();
  const existingNames = new Set(config.properties.map((p) => p.name));

  let added = 0;
  for (const prop of expectedProperties) {
    if (!existingNames.has(prop.name)) {
      await collection.config.addProperty(prop as { name: string; dataType: 'text' });
      added++;
    }
  }
  return added;
}

/**
 * Ensure a user collection exists (create if needed).
 * If the collection already exists, reconciles any missing properties.
 */
export async function ensureUserCollection(
  client: WeaviateClient,
  userId: string
): Promise<boolean> {
  const collectionName = `Memory_users_${userId}`;

  const exists = await client.collections.exists(collectionName);
  if (exists) {
    await reconcileCollectionProperties(client, collectionName, COMMON_MEMORY_PROPERTIES);
    return false;
  }

  const schema = createUserCollectionSchema(userId);
  await client.collections.create(schema);
  return true;
}

/**
 * Ensure the spaces collection exists (create if needed).
 * If the collection already exists, reconciles any missing properties.
 */
export async function ensureSpacesCollection(client: WeaviateClient): Promise<boolean> {
  const collectionName = 'Memory_spaces_public';

  const exists = await client.collections.exists(collectionName);
  if (exists) {
    await reconcileCollectionProperties(
      client,
      collectionName,
      [...COMMON_MEMORY_PROPERTIES, ...PUBLISHED_MEMORY_PROPERTIES],
    );
    return false;
  }

  const schema = createSpaceCollectionSchema();
  await client.collections.create(schema);
  return true;
}

/**
 * Ensure a group collection exists (create if needed).
 * If the collection already exists, reconciles any missing properties.
 */
export async function ensureGroupCollection(
  client: WeaviateClient,
  groupId: string
): Promise<boolean> {
  const collectionName = `Memory_groups_${groupId}`;

  const exists = await client.collections.exists(collectionName);
  if (exists) {
    await reconcileCollectionProperties(
      client,
      collectionName,
      [...COMMON_MEMORY_PROPERTIES, ...PUBLISHED_MEMORY_PROPERTIES],
    );
    return false;
  }

  const schema = createGroupCollectionSchema(groupId);
  await client.collections.create(schema);
  return true;
}

/**
 * Get all property names for user collections
 */
export function getUserCollectionProperties(): string[] {
  return COMMON_MEMORY_PROPERTIES.map(prop => prop.name);
}

/**
 * Get all property names for space/group collections
 */
export function getPublishedCollectionProperties(): string[] {
  return [
    ...COMMON_MEMORY_PROPERTIES,
    ...PUBLISHED_MEMORY_PROPERTIES,
  ].map(prop => prop.name);
}

/**
 * Validate that a collection name matches the expected v2 pattern
 */
export function validateV2CollectionName(collectionName: string): boolean {
  const userPattern = /^Memory_users_[a-zA-Z0-9_-]+$/;
  const spacePattern = /^Memory_spaces_public$/;
  const groupPattern = /^Memory_groups_[a-zA-Z0-9_-]+$/;

  if (
    userPattern.test(collectionName) ||
    spacePattern.test(collectionName) ||
    groupPattern.test(collectionName)
  ) {
    return true;
  }

  throw new Error(
    `Invalid v2 collection name: ${collectionName}. ` +
    `Must match: Memory_users_{userId}, Memory_spaces_public, or Memory_groups_{groupId}`
  );
}

/**
 * Get the collection type from a collection name
 */
export function getCollectionType(collectionName: string): 'users' | 'spaces' | 'groups' {
  if (collectionName.startsWith('Memory_users_')) return 'users';
  if (collectionName === 'Memory_spaces_public') return 'spaces';
  if (collectionName.startsWith('Memory_groups_')) return 'groups';
  throw new Error(`Unknown collection type for: ${collectionName}`);
}

/**
 * Extract the ID from a user or group collection name
 */
export function extractIdFromCollectionName(collectionName: string): string | null {
  if (collectionName.startsWith('Memory_users_')) return collectionName.replace('Memory_users_', '');
  if (collectionName.startsWith('Memory_groups_')) return collectionName.replace('Memory_groups_', '');
  if (collectionName === 'Memory_spaces_public') return null;
  throw new Error(`Cannot extract ID from: ${collectionName}`);
}
