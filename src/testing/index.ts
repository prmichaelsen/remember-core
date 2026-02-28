/**
 * Testing utilities barrel exports.
 *
 * Provides mock Weaviate collection/client and mock logger for unit tests.
 */

export {
  createMockCollection,
  createMockWeaviateClient,
  createMockLogger,
  type MockWeaviateObject,
} from './weaviate-mock.js';

export {
  generateMemory,
  generateMemories,
  filterBySpace,
  filterByGroup,
  getDatasetStats,
  measureMs,
  benchmark,
  type SyntheticMemory,
  type GenerateOptions,
} from './test-data-generator.js';
