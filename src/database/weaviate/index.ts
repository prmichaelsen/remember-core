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
  ensureCollection,
  getUserCollectionProperties,
  getPublishedCollectionProperties,
  validateV2CollectionName,
  getCollectionType,
  extractIdFromCollectionName,
  FEEL_DIMENSION_PROPERTIES,
  FUNCTIONAL_DIMENSION_PROPERTIES,
  ALL_SCORING_DIMENSIONS,
  COMPOSITE_SCORE_PROPERTIES,
  REM_METADATA_PROPERTIES,
  EMOTIONAL_WEIGHTING_PROPERTIES,
} from './v2-collections.js';
