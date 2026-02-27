/**
 * Weaviate space collection schema and utilities.
 * Ported from remember-mcp/src/weaviate/space-schema.ts
 */

import type { WeaviateClient, Collection } from 'weaviate-client';
import { SUPPORTED_SPACES, SPACE_DISPLAY_NAMES, type SpaceId } from '../../types/space.types';
import { createSpaceCollectionSchema } from './v2-collections';

/**
 * Unified public collection name for all public spaces (v2)
 */
export const PUBLIC_COLLECTION_NAME = 'Memory_spaces_public';

/**
 * Get collection name for a space.
 * @deprecated Use PUBLIC_COLLECTION_NAME instead.
 */
export function getSpaceCollectionName(spaceId: string): string {
  return `Memory_${spaceId}`;
}

/**
 * Sanitize display name to space ID (snake_case).
 */
export function sanitizeSpaceId(displayName: string): string {
  return displayName.toLowerCase().replace(/\s+/g, '_');
}

/**
 * Get display name for a space ID.
 */
export function getSpaceDisplayName(spaceId: string): string {
  return SPACE_DISPLAY_NAMES[spaceId as SpaceId] || spaceId;
}

/**
 * Validate space ID.
 */
export function isValidSpaceId(spaceId: string): boolean {
  return SUPPORTED_SPACES.includes(spaceId as SpaceId);
}

/**
 * Ensure the unified public collection exists, creating it if needed.
 */
export async function ensurePublicCollection(
  client: WeaviateClient
): Promise<Collection<any>> {
  const collectionName = PUBLIC_COLLECTION_NAME;

  const exists = await client.collections.exists(collectionName);
  if (!exists) {
    const schema = createSpaceCollectionSchema();
    await client.collections.create(schema);
  }

  return client.collections.get(collectionName);
}

/**
 * Ensure a space collection exists, creating it if needed.
 * @deprecated Use ensurePublicCollection() instead.
 */
export async function ensureSpaceCollection(
  client: WeaviateClient,
  spaceId: string
): Promise<Collection<any>> {
  if (!isValidSpaceId(spaceId)) {
    throw new Error(`Invalid space ID: ${spaceId}. Supported spaces: ${SUPPORTED_SPACES.join(', ')}`);
  }

  const collectionName = getSpaceCollectionName(spaceId);

  const exists = await client.collections.exists(collectionName);
  if (!exists) {
    // Create inline for legacy per-space collections
    const schema = createSpaceCollectionSchema();
    await client.collections.create({ ...schema, name: collectionName });
  }

  return client.collections.get(collectionName);
}
