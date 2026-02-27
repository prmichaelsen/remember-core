// src/config/loader.ts
// Pattern: Config Loading (core-sdk.config-loading.md)

import { AppConfigSchema, AppConfig } from './schema';

/**
 * Load and validate application configuration.
 *
 * Priority order (highest wins):
 *   1. Environment variables
 *   2. Config object / file content (caller's responsibility to load YAML/JSON)
 *   3. Schema defaults
 *
 * Throws a ZodError with a detailed message if validation fails.
 * Call once at startup before any services are initialized.
 *
 * @example
 * const raw = JSON.parse(readFileSync('./config/production.json', 'utf-8'));
 * const config = loadConfig(raw);
 */
export function loadConfig(raw: unknown = {}): AppConfig {
  const env = process.env;

  // Merge environment variable overrides on top of raw config
  const merged = deepMerge(raw as Record<string, unknown>, {
    env: env.NODE_ENV,
    database: {
      host:     env.DB_HOST,
      port:     env.DB_PORT     ? parseInt(env.DB_PORT)     : undefined,
      name:     env.DB_NAME,
      user:     env.DB_USER,
      password: env.DB_PASSWORD,
    },
    server: {
      port:    env.PORT        ? parseInt(env.PORT)        : undefined,
      host:    env.SERVER_HOST,
    },
    logging: {
      level:  env.LOG_LEVEL,
      format: env.LOG_FORMAT,
    },
  });

  // Parse validates and applies schema defaults
  return AppConfigSchema.parse(merged);
}

/**
 * Deep merge two plain objects, omitting undefined values from the source.
 * Source values take priority over target values.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof target[key] === 'object' &&
      target[key] !== null
    ) {
      result[key] = deepMerge(
        target[key] as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
