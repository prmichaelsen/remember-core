/**
 * Configuration module barrel exports.
 *
 * Provides environment config loading, debug level management,
 * and scaffolded config schema/loader for future use.
 */

// Remember-specific environment configuration
export {
  loadRememberConfig,
  validateRememberConfig,
  type RememberConfig,
  type WeaviateEnvConfig,
  type OpenAIEnvConfig,
  type FirebaseEnvConfig,
  type ServerEnvConfig,
} from './environment.js';

// Debug level management
export {
  DebugLevel,
  parseDebugLevel,
  createDebugConfig,
  type DebugConfig,
} from './debug.js';

// Scaffolded config schema (generic, zod-based — available when zod is added)
// export {
//   AppConfigSchema,
//   DatabaseConfigSchema,
//   ServerConfigSchema,
//   LoggingConfigSchema,
//   type AppConfig,
//   type DatabaseConfig,
//   type ServerConfig,
//   type LoggingConfig,
//   type ServiceConfig,
//   type AdapterConfig,
//   createTestConfig,
// } from './schema.js';
//
// export { loadConfig } from './loader.js';
