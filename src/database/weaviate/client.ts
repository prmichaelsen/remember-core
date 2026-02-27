/**
 * Weaviate client initialization and connection management.
 * Ported from remember-mcp/src/weaviate/client.ts
 *
 * Note: This module depends on config (Task 6) and logger/debug (Task 7).
 * Import paths reference where those modules will be after porting.
 */

import weaviate, { WeaviateClient } from 'weaviate-client';

let client: WeaviateClient | null = null;

/**
 * Weaviate connection configuration
 */
export interface WeaviateConfig {
  url: string;
  apiKey?: string;
  openaiApiKey?: string;
}

/**
 * Initialize Weaviate client.
 *
 * Connection strategy:
 * - If URL contains localhost/127.0.0.1 → use local connection
 * - Otherwise → use cloud connection (remote/self-hosted)
 */
export async function initWeaviateClient(config: WeaviateConfig): Promise<WeaviateClient> {
  if (client) {
    return client;
  }

  const isLocal = config.url.includes('localhost') || config.url.includes('127.0.0.1');

  if (!isLocal) {
    client = await weaviate.connectToWeaviateCloud(config.url, {
      authCredentials: config.apiKey
        ? new weaviate.ApiKey(config.apiKey)
        : undefined,
      headers: config.openaiApiKey
        ? { 'X-OpenAI-Api-Key': config.openaiApiKey }
        : undefined,
    });
  } else {
    const localConfig: any = {
      host: config.url.replace(/^https?:\/\//, '').split(':')[0],
      port: config.url.includes(':')
        ? parseInt(config.url.split(':').pop() || '8080')
        : 8080,
      scheme: config.url.startsWith('https') ? 'https' : 'http',
    };

    if (config.apiKey) {
      localConfig.authClientSecret = new weaviate.ApiKey(config.apiKey);
    }

    if (config.openaiApiKey) {
      localConfig.headers = { 'X-OpenAI-Api-Key': config.openaiApiKey };
    }

    client = await weaviate.connectToLocal(localConfig);
  }

  return client;
}

/**
 * Get Weaviate client instance
 */
export function getWeaviateClient(): WeaviateClient {
  if (!client) {
    throw new Error('Weaviate client not initialized. Call initWeaviateClient() first.');
  }
  return client;
}

/**
 * Test Weaviate connection
 */
export async function testWeaviateConnection(): Promise<boolean> {
  try {
    const weaviateClient = getWeaviateClient();
    return await weaviateClient.isReady();
  } catch {
    return false;
  }
}

/**
 * Get collection name for user's memories (v2 format)
 */
export function getMemoryCollectionName(userId: string): string {
  return `Memory_users_${userId}`;
}

/**
 * Get collection name for user's templates
 */
export function getTemplateCollectionName(userId: string): string {
  return `Template_${sanitizeUserId(userId)}`;
}

/**
 * Get collection name for user's audit logs
 */
export function getAuditCollectionName(userId: string): string {
  return `Audit_${sanitizeUserId(userId)}`;
}

/**
 * Sanitize user_id for collection name.
 * @deprecated v2 uses literal userId — no sanitization needed. Kept for migration only.
 */
export function sanitizeUserId(userId: string): string {
  let sanitized = userId.replace(/[^a-zA-Z0-9]/g, '_');
  if (/^[0-9]/.test(sanitized)) {
    sanitized = '_' + sanitized;
  }
  return sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
}

/**
 * List of all memory properties to fetch.
 * Includes both v2 canonical names and v1 compat names.
 */
export const ALL_MEMORY_PROPERTIES = [
  'user_id', 'doc_type',
  'content', 'content_type', 'title', 'summary', 'type',
  'weight', 'base_weight', 'trust_score', 'trust', 'confidence', 'computed_weight',
  'location_name', 'location_lat', 'location_lon',
  'location_gps_lat', 'location_gps_lng', 'location_address', 'location_city', 'location_country', 'location_source',
  'locale_language', 'locale_timezone',
  'context_conversation_id', 'context_summary', 'context_timestamp', 'context_app', 'context_url',
  'relationship_ids', 'related_memory_ids', 'relationships', 'memory_ids',
  'relationship_type', 'observation', 'strength',
  'access_count', 'last_accessed_at',
  'tags', 'references', 'created_at', 'updated_at', 'version', 'template_id',
  'space_ids', 'group_ids',
  'parent_id', 'thread_root_id', 'moderation_flags',
  'spaces', 'space_id', 'author_id', 'ghost_id', 'attribution', 'published_at', 'discovery_count',
  'space_memory_id', 'original_memory_id', 'revised_at', 'revision_count', 'revision_history',
  'deleted_at', 'deleted_by', 'deletion_reason',
] as const;

/**
 * Fetch a memory object by ID with all properties.
 * Falls back to unspecified fetch if full property query fails.
 */
export async function fetchMemoryWithAllProperties(
  collection: any,
  memoryId: string
) {
  try {
    return await collection.query.fetchObjectById(memoryId, {
      returnProperties: ALL_MEMORY_PROPERTIES,
    });
  } catch {
    // Fallback: fetch without specifying properties
    return await collection.query.fetchObjectById(memoryId);
  }
}

/**
 * Check if collection exists
 */
export async function collectionExists(collectionName: string): Promise<boolean> {
  try {
    const weaviateClient = getWeaviateClient();
    return await weaviateClient.collections.exists(collectionName);
  } catch {
    return false;
  }
}

/**
 * Close Weaviate client connection
 */
export async function closeWeaviateClient(): Promise<void> {
  if (client) {
    client = null;
  }
}
