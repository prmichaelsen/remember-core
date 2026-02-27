/**
 * Firebase Admin SDK initialization for remember-core.
 *
 * Ported from remember-mcp/src/firestore/init.ts
 * Design: accepts FirestoreConfig parameter instead of importing from a config module,
 * keeping the core SDK transport-agnostic. Consumers provide their own config.
 */

import { initializeApp } from '@prmichaelsen/firebase-admin-sdk-v8';

// Re-export firebase-admin-sdk-v8 functions for convenience
export {
  getDocument,
  setDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  queryDocuments,
  batchWrite,
  FieldValue,
  verifyIdToken,
  type QueryOptions,
} from '@prmichaelsen/firebase-admin-sdk-v8';

/**
 * Configuration required to initialize Firebase Admin SDK.
 */
export interface FirestoreConfig {
  /** JSON string containing the Firebase service account credentials */
  serviceAccount: string;
  /** Firebase project ID */
  projectId: string;
}

/**
 * Optional logger interface for Firestore initialization.
 * Consumers can provide their own logger; falls back to console.
 */
export interface FirestoreLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const defaultLogger: FirestoreLogger = {
  info: (message, meta) => console.log(message, meta),
  error: (message, meta) => console.error(message, meta),
};

let initialized = false;

/**
 * Initialize Firebase Admin SDK.
 *
 * FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY should be a JSON string containing the service account.
 * Make sure it's properly escaped in your .env file.
 *
 * @param config - Firebase configuration with serviceAccount JSON and projectId
 * @param logger - Optional logger; defaults to console
 */
export function initFirestore(
  config: FirestoreConfig,
  logger: FirestoreLogger = defaultLogger,
): void {
  if (initialized) {
    return;
  }

  try {
    const serviceAccount = JSON.parse(config.serviceAccount);

    initializeApp({
      serviceAccount,
      projectId: config.projectId,
    });

    initialized = true;
    logger.info('Firestore initialized successfully', {
      module: 'firestore-init',
    });
  } catch (error) {
    logger.error('Firestore initialization failed', {
      module: 'firestore-init',
      error: error instanceof Error ? error.message : String(error),
    });
    logger.error('Make sure FIREBASE_ADMIN_SERVICE_ACCOUNT_KEY is valid JSON', {
      module: 'firestore-init',
    });
    logger.error('Check for proper escaping in .env file', {
      module: 'firestore-init',
    });
    throw error;
  }
}

/**
 * Check if Firestore is initialized.
 */
export function isFirestoreInitialized(): boolean {
  return initialized;
}

/**
 * Test Firestore connection by attempting a simple read.
 *
 * @param logger - Optional logger; defaults to console
 */
export async function testFirestoreConnection(
  logger: FirestoreLogger = defaultLogger,
): Promise<boolean> {
  try {
    if (!initialized) {
      throw new Error('Firestore not initialized');
    }

    const { getDocument } = await import('@prmichaelsen/firebase-admin-sdk-v8');
    await getDocument('_health_check', 'test');

    logger.info('Firestore connection test successful', {
      module: 'firestore-init',
    });
    return true;
  } catch (error) {
    logger.error('Firestore connection test failed', {
      module: 'firestore-init',
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Reset initialization state. Useful for testing.
 * @internal
 */
export function _resetFirestoreState(): void {
  initialized = false;
}
