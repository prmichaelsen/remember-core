/**
 * Weaviate schema management for user memory collections.
 * Ported from remember-mcp/src/weaviate/schema.ts
 */

import { getWeaviateClient } from './client';
import { createUserCollectionSchema } from './v2-collections';

/**
 * Create Memory collection schema for a user.
 * Stores BOTH memories AND relationships using doc_type discriminator.
 */
export async function createMemoryCollection(userId: string): Promise<void> {
  const client = getWeaviateClient();
  const collectionName = `Memory_users_${userId}`;

  const exists = await client.collections.exists(collectionName);
  if (exists) return;

  const schema = createUserCollectionSchema(userId);
  await client.collections.create(schema);
}

/**
 * Ensure Memory collection exists for user (lazy creation)
 */
export async function ensureMemoryCollection(userId: string): Promise<void> {
  const client = getWeaviateClient();
  const collectionName = `Memory_users_${userId}`;

  const exists = await client.collections.exists(collectionName);
  if (!exists) {
    await createMemoryCollection(userId);
  }
}

/**
 * Get Memory collection for user
 */
export function getMemoryCollection(userId: string) {
  const client = getWeaviateClient();
  const collectionName = `Memory_users_${userId}`;
  return client.collections.get(collectionName);
}

/**
 * Delete Memory collection for user (use with caution!)
 */
export async function deleteMemoryCollection(userId: string): Promise<void> {
  const client = getWeaviateClient();
  const collectionName = `Memory_users_${userId}`;

  const exists = await client.collections.exists(collectionName);
  if (exists) {
    await client.collections.delete(collectionName);
  }
}
