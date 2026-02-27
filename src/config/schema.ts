// src/config/schema.ts
// Pattern: Configuration Types (core-sdk.types-config.md) + Config Schema (core-sdk.config-schema.md)

import { z } from 'zod';
import { DeepPartial } from '../types/utils.types';

// ─── Sub-schemas ──────────────────────────────────────────────────────────

export const DatabaseConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.number().int().min(1).max(65535).default(5432),
  name: z.string(),
  user: z.string(),
  password: z.string(),
  ssl: z.boolean().default(false),
  poolMin: z.number().int().default(2),
  poolMax: z.number().int().default(10),
});

export const ServerConfigSchema = z.object({
  port: z.number().int().default(3000),
  host: z.string().default('0.0.0.0'),
  corsOrigins: z.array(z.string()).default([]),
  requestTimeoutMs: z.number().int().default(30_000),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  format: z.enum(['json', 'pretty']).default('json'),
});

export const AppConfigSchema = z.object({
  env: z.enum(['development', 'staging', 'production']).default('development'),
  database: DatabaseConfigSchema,
  server: ServerConfigSchema,
  logging: LoggingConfigSchema,
});

// ─── Derived Types ─────────────────────────────────────────────────────────
// Always derived from schema — never written manually.

export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type ServerConfig   = z.infer<typeof ServerConfigSchema>;
export type LoggingConfig  = z.infer<typeof LoggingConfigSchema>;
export type AppConfig      = z.infer<typeof AppConfigSchema>;

// ─── Layer-Scoped Config Slices ────────────────────────────────────────────
// Each layer receives only the config sections it needs.

/** Config shape for service layer (database + logging) */
export type ServiceConfig = Pick<AppConfig, 'database' | 'logging'>;

/** Config shape for adapter layer (server + logging) */
export type AdapterConfig = Pick<AppConfig, 'server' | 'logging'>;

// ─── Test Helper ──────────────────────────────────────────────────────────

/**
 * Create a complete AppConfig with test defaults and optional overrides.
 * Use in test files to avoid repeating boilerplate.
 *
 * @example
 * const config = createTestConfig({ database: { port: 5433 } });
 */
export function createTestConfig(
  overrides: DeepPartial<AppConfig> = {}
): AppConfig {
  const base = AppConfigSchema.parse({
    env: 'development',
    database: {
      host: 'localhost',
      port: 5432,
      name: 'test_db',
      user: 'test',
      password: 'test',
    },
    server: {},
    logging: { level: 'error', format: 'pretty' },
    ...overrides,
  });
  return base;
}
