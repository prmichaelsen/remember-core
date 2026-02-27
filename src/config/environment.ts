/**
 * Environment configuration for remember-core.
 *
 * Ported from remember-mcp/src/config.ts.
 * Design: returns a typed config object from environment variables.
 * Consumers call loadRememberConfig() at startup to get validated config.
 */

import { DebugLevel, parseDebugLevel, createDebugConfig, type DebugConfig } from './debug.js';

/**
 * Weaviate vector database configuration.
 */
export interface WeaviateEnvConfig {
  /** Weaviate REST endpoint URL */
  url: string;
  /** Weaviate API key (empty string if no auth) */
  apiKey: string;
}

/**
 * OpenAI configuration (for embeddings).
 */
export interface OpenAIEnvConfig {
  /** OpenAI API key for embeddings */
  apiKey: string;
}

/**
 * Firebase configuration.
 */
export interface FirebaseEnvConfig {
  /** JSON string containing Firebase service account credentials */
  serviceAccount: string;
  /** Firebase project ID */
  projectId: string;
}

/**
 * Server configuration.
 */
export interface ServerEnvConfig {
  /** Server port */
  port: number;
  /** Node environment (development, production, etc.) */
  nodeEnv: string;
  /** Log level string */
  logLevel: string;
}

/**
 * Complete remember-core configuration loaded from environment variables.
 */
export interface RememberConfig {
  weaviate: WeaviateEnvConfig;
  openai: OpenAIEnvConfig;
  firebase: FirebaseEnvConfig;
  server: ServerEnvConfig;
  debug: DebugConfig;
}

/**
 * Load remember-core configuration from environment variables.
 *
 * Uses process.env directly. Consumers should call dotenv.config() or
 * otherwise populate env vars before calling this function.
 *
 * @returns Typed configuration object
 */
export function loadRememberConfig(): RememberConfig {
  const env = process.env;

  return {
    weaviate: {
      url: env.WEAVIATE_REST_URL || 'http://localhost:8080',
      apiKey: env.WEAVIATE_API_KEY || '',
    },
    openai: {
      apiKey: env.OPENAI_EMBEDDINGS_API_KEY || env.OPENAI_APIKEY || '',
    },
    firebase: {
      serviceAccount: env.FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY || '',
      projectId: env.FIREBASE_PROJECT_ID || '',
    },
    server: {
      port: parseInt(env.PORT || '3000', 10),
      nodeEnv: env.NODE_ENV || 'development',
      logLevel: env.LOG_LEVEL || 'info',
    },
    debug: createDebugConfig(parseDebugLevel(env.REMEMBER_MCP_DEBUG_LEVEL)),
  };
}

/**
 * Validate that required configuration values are present.
 * Throws an Error listing all missing required env vars.
 *
 * @param config - Configuration object to validate
 */
export function validateRememberConfig(config: RememberConfig): void {
  const required: Array<{ key: string; value: string }> = [
    { key: 'WEAVIATE_REST_URL', value: config.weaviate.url },
    { key: 'OPENAI_EMBEDDINGS_API_KEY', value: config.openai.apiKey },
    { key: 'FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY', value: config.firebase.serviceAccount },
    { key: 'FIREBASE_PROJECT_ID', value: config.firebase.projectId },
  ];

  const missing = required.filter(
    (r) => !r.value || r.value === 'http://localhost:8080',
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.map((m) => m.key).join(', ')}`,
    );
  }
}
