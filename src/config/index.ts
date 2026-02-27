// src/config/index.ts

export {
  AppConfigSchema,
  DatabaseConfigSchema,
  ServerConfigSchema,
  LoggingConfigSchema,
} from './schema';

export type {
  AppConfig,
  DatabaseConfig,
  ServerConfig,
  LoggingConfig,
  ServiceConfig,
  AdapterConfig,
} from './schema';

export { createTestConfig } from './schema';
export { loadConfig } from './loader';
