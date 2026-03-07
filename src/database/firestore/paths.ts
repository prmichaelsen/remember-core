/**
 * Firestore collection path helpers.
 *
 * Ported from remember-mcp/src/firestore/paths.ts
 *
 * Following the environment-based prefix + users subcollection pattern:
 * - Environment prefix: e0.remember-mcp (dev), remember-mcp (prod)
 * - User-scoped data: {BASE}.users/{user_id}/*
 * - Shared data: {BASE}.templates/default, {BASE}.user-permissions
 */

const APP_NAME = 'remember-mcp';

/**
 * Get the database collection prefix based on environment.
 *
 * - Development: Uses ENVIRONMENT env var or DB_PREFIX, defaults to 'e0.remember-mcp'
 * - Production: Uses base 'remember-mcp'
 *
 * This allows developers to use their own database entries as a sandbox per dev or branch.
 */
function getBasePrefix(): string {
  const environment = process.env.ENVIRONMENT;
  if (environment && environment !== 'production' && environment !== 'prod') {
    return `${environment}.${APP_NAME}`;
  }

  const isDevelopment = process.env.NODE_ENV === 'development';

  if (isDevelopment) {
    const customPrefix = process.env.DB_PREFIX;
    if (customPrefix) {
      return customPrefix;
    }
    return `e0.${APP_NAME}`;
  }

  return APP_NAME;
}

export const BASE = getBasePrefix();

// ============================================================================
// USER-SCOPED COLLECTIONS (under users/{user_id}/)
// ============================================================================

/**
 * Get path to user preferences document.
 * Pattern: {BASE}.users/{user_id}/preferences
 */
export function getUserPreferencesPath(userId: string): string {
  return `${BASE}.users/${userId}/preferences`;
}

/**
 * Get path to user's templates collection.
 * Pattern: {BASE}.users/{user_id}/templates
 */
export function getUserTemplatesPath(userId: string): string {
  return `${BASE}.users/${userId}/templates`;
}

/**
 * Get path to user's access logs collection.
 * Pattern: {BASE}.users/{user_id}/access-logs
 */
export function getUserAccessLogsPath(userId: string): string {
  return `${BASE}.users/${userId}/access-logs`;
}

/**
 * Get path to user's trust relationships collection.
 * Pattern: {BASE}.users/{user_id}/trust-relationships
 */
export function getUserTrustRelationshipsPath(userId: string): string {
  return `${BASE}.users/${userId}/trust-relationships`;
}

// ============================================================================
// CROSS-USER COLLECTIONS (outside users/)
// ============================================================================

/**
 * Get path to user's allowed accessors collection (permissions).
 * Pattern: {BASE}.user-permissions/{owner_user_id}/allowed-accessors
 *
 * Note: Outside users/ because it involves two users (owner + accessor)
 */
export function getUserPermissionsPath(ownerUserId: string): string {
  return `${BASE}.user-permissions/${ownerUserId}/allowed-accessors`;
}

/**
 * Get path to specific permission document.
 * Pattern: {BASE}.user-permissions/{owner_user_id}/allowed-accessors/{accessor_user_id}
 */
export function getUserPermissionPath(ownerUserId: string, accessorUserId: string): string {
  return `${BASE}.user-permissions/${ownerUserId}/allowed-accessors/${accessorUserId}`;
}

// ============================================================================
// SHARED/GLOBAL COLLECTIONS
// ============================================================================

/**
 * Get path to default templates collection.
 * Pattern: {BASE}.templates/default
 */
export function getDefaultTemplatesPath(): string {
  return `${BASE}.templates/default`;
}

/**
 * Get path to specific default template.
 * Pattern: {BASE}.templates/default/{template_id}
 */
export function getDefaultTemplatePath(templateId: string): string {
  return `${BASE}.templates/default/${templateId}`;
}

// ============================================================================
// REM STATE COLLECTIONS
// ============================================================================

/**
 * Get path to REM cursor state document.
 * Pattern: {BASE}.rem_state (collection), cursor (docId)
 */
export function getRemCursorPath(): { collectionPath: string; docId: string } {
  return { collectionPath: `${BASE}.rem_state`, docId: 'cursor' };
}

/**
 * Get path to REM collection state document.
 * Pattern: {BASE}.rem_state_collections (collection), {collectionId} (docId)
 *
 * Note: Uses flat collection instead of subcollection to avoid Firestore
 * path component count issues (subcollections require parent documents).
 */
export function getRemCollectionStatePath(collectionId: string): { collectionPath: string; docId: string } {
  return { collectionPath: `${BASE}.rem_state_collections`, docId: collectionId };
}

// ============================================================================
// COLLECTION REGISTRY
// ============================================================================

/**
 * Get path to the collection registry (Firestore collection).
 * Pattern: {BASE}.collection_registry
 *
 * Stores lightweight entries for all Weaviate memory collections,
 * enabling O(1) cursor-based lookups instead of listing all collections.
 */
export function getCollectionRegistryPath(): string {
  return `${BASE}.collection_registry`;
}

// ============================================================================
// MEMORY RATINGS
// ============================================================================

/**
 * Get path to a memory's ratings subcollection.
 * Pattern: {BASE}.memory_ratings/{memoryId}/ratings
 *
 * Individual ratings stored as docs with rater userId as docId.
 */
export function getMemoryRatingsPath(memoryId: string): string {
  return `${BASE}.memory_ratings/${memoryId}/ratings`;
}

// ============================================================================
// USER RATINGS INDEX (user-centric mirror of memory_ratings)
// ============================================================================

/**
 * Get path to a user's ratings index subcollection.
 * Pattern: {BASE}.user_ratings/{userId}/ratings
 *
 * Mirrors memory_ratings but indexed by userId for efficient
 * "get all memories rated by user X" queries.
 * Docs keyed by memoryId.
 */
export function getUserRatingsPath(userId: string): string {
  return `${BASE}.user_ratings/${userId}/ratings`;
}

// ============================================================================
// PREFERENCE CENTROIDS
// ============================================================================

/**
 * Get path to a user's cached preference centroid.
 * Pattern: {BASE}.preference_centroids
 *
 * Stores computed preference centroid vectors for byRecommendation sort mode.
 * Docs keyed by userId.
 */
export function getPreferenceCentroidsPath(): string {
  return `${BASE}.preference_centroids`;
}

// ============================================================================
// MEMORY INDEX
// ============================================================================

/**
 * Get path to the memory index (Firestore collection).
 * Pattern: {BASE}.memory_index
 *
 * Maps memory UUIDs to their Weaviate collection names,
 * enabling O(1) cross-collection memory resolution.
 */
export function getMemoryIndexPath(): string {
  return `${BASE}.memory_index`;
}
