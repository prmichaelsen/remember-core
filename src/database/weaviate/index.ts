// src/database/weaviate/index.ts

// Client
export type { WeaviateConfig } from './client.js';
export {
  initWeaviateClient,
  getWeaviateClient,
  testWeaviateConnection,
  getMemoryCollectionName,
  getTemplateCollectionName,
  getAuditCollectionName,
  sanitizeUserId,
  ALL_MEMORY_PROPERTIES,
  fetchMemoryWithAllProperties,
  collectionExists,
  closeWeaviateClient,
} from './client.js';

// Schema management
export {
  createMemoryCollection,
  ensureMemoryCollection,
  getMemoryCollection,
  deleteMemoryCollection,
} from './schema.js';

// Space schema
export {
  PUBLIC_COLLECTION_NAME,
  getSpaceCollectionName,
  sanitizeSpaceId,
  getSpaceDisplayName,
  isValidSpaceId,
  ensurePublicCollection,
  ensureSpaceCollection,
} from './space-schema.js';

// V2 collection definitions
export {
  createUserCollectionSchema,
  createSpaceCollectionSchema,
  createGroupCollectionSchema,
  ensureUserCollection,
  ensureSpacesCollection,
  ensureGroupCollection,
  getUserCollectionProperties,
  getPublishedCollectionProperties,
  validateV2CollectionName,
  getCollectionType,
  extractIdFromCollectionName,
} from './v2-collections.js';
