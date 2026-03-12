/**
 * Firebase Admin SDK initialization for remember-core.
 *
 * Migrated from @prmichaelsen/firebase-admin-sdk-v8 to official firebase-admin.
 * Preserves the same exported API surface (getDocument, setDocument, etc.)
 * so all consuming services work without changes.
 */

import admin from 'firebase-admin';
import type { ServiceAccount } from 'firebase-admin';
import type {
  WhereFilterOp as FirestoreWhereFilterOp,
  OrderByDirection,
} from 'firebase-admin/firestore';

// ---------------------------------------------------------------------------
// Types — matching the previous @prmichaelsen/firebase-admin-sdk-v8 API
// ---------------------------------------------------------------------------

type DataObject = Record<string, any>;

export interface DocumentReference {
  id: string;
  path: string;
}

export interface SetOptions {
  merge?: boolean;
  mergeFields?: string[];
}

export type WhereFilterOp =
  | '<' | '<=' | '==' | '!=' | '>=' | '>'
  | 'array-contains' | 'array-contains-any' | 'in' | 'not-in';

export interface QueryFilter {
  field: string;
  op: WhereFilterOp;
  value: any;
}

export interface QueryOrder {
  field: string;
  direction: 'ASCENDING' | 'DESCENDING';
}

export interface QueryOptions {
  where?: QueryFilter[];
  orderBy?: QueryOrder[];
  limit?: number;
  offset?: number;
  startAt?: any[];
  startAfter?: any[];
  endAt?: any[];
  endBefore?: any[];
}

export interface BatchWrite {
  type: 'set' | 'update' | 'delete';
  collectionPath: string;
  documentId: string;
  data?: DataObject;
  options?: SetOptions;
}

// ---------------------------------------------------------------------------
// FieldValue — matching the previous API's namespace
// ---------------------------------------------------------------------------

export const FieldValue = {
  serverTimestamp: () => admin.firestore.FieldValue.serverTimestamp(),
  increment: (n: number) => admin.firestore.FieldValue.increment(n),
  arrayUnion: (...elements: any[]) => admin.firestore.FieldValue.arrayUnion(...elements),
  arrayRemove: (...elements: any[]) => admin.firestore.FieldValue.arrayRemove(...elements),
  delete: () => admin.firestore.FieldValue.delete(),
};

// ---------------------------------------------------------------------------
// Config & init
// ---------------------------------------------------------------------------

export interface FirestoreConfig {
  /** JSON string containing the Firebase service account credentials */
  serviceAccount: string;
  /** Firebase project ID */
  projectId: string;
}

export interface FirestoreLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const defaultLogger: FirestoreLogger = {
  info: (message, meta) => console.log(message, meta),
  error: (message, meta) => console.error(message, meta),
};

let initialized = false;

function db(): admin.firestore.Firestore {
  return admin.firestore();
}

/**
 * Initialize Firebase Admin SDK.
 */
export function initFirestore(
  config: FirestoreConfig,
  logger: FirestoreLogger = defaultLogger,
): void {
  if (initialized) {
    return;
  }

  try {
    const serviceAccount: ServiceAccount = JSON.parse(config.serviceAccount);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
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

export function isFirestoreInitialized(): boolean {
  return initialized;
}

export async function testFirestoreConnection(
  logger: FirestoreLogger = defaultLogger,
): Promise<boolean> {
  try {
    if (!initialized) {
      throw new Error('Firestore not initialized');
    }

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

// ---------------------------------------------------------------------------
// CRUD helpers — same signatures as @prmichaelsen/firebase-admin-sdk-v8
// ---------------------------------------------------------------------------

/**
 * Resolve a collection path string to a Firestore CollectionReference.
 * Supports nested paths like "users/uid/posts".
 */
function collectionRef(collectionPath: string): admin.firestore.CollectionReference {
  return db().collection(collectionPath);
}

export async function getDocument(
  collectionPath: string,
  documentId: string,
): Promise<DataObject | null> {
  const snap = await collectionRef(collectionPath).doc(documentId).get();
  if (!snap.exists) return null;
  return snap.data() as DataObject;
}

export async function setDocument(
  collectionPath: string,
  documentId: string,
  data: DataObject,
  options?: SetOptions,
): Promise<void> {
  const ref = collectionRef(collectionPath).doc(documentId);
  if (options) {
    await ref.set(data, options);
  } else {
    await ref.set(data);
  }
}

export async function addDocument(
  collectionPath: string,
  data: DataObject,
  documentId?: string,
): Promise<DocumentReference> {
  if (documentId) {
    const ref = collectionRef(collectionPath).doc(documentId);
    await ref.set(data);
    return { id: documentId, path: ref.path };
  }
  const ref = await collectionRef(collectionPath).add(data);
  return { id: ref.id, path: ref.path };
}

export async function updateDocument(
  collectionPath: string,
  documentId: string,
  data: DataObject,
): Promise<void> {
  await collectionRef(collectionPath).doc(documentId).update(data);
}

export async function deleteDocument(
  collectionPath: string,
  documentId: string,
): Promise<void> {
  await collectionRef(collectionPath).doc(documentId).delete();
}

// ---------------------------------------------------------------------------
// Query helper
// ---------------------------------------------------------------------------

const DIRECTION_MAP: Record<string, OrderByDirection> = {
  ASCENDING: 'asc',
  DESCENDING: 'desc',
};

export async function queryDocuments(
  collectionPath: string,
  options?: QueryOptions,
): Promise<Array<{ id: string; data: DataObject }>> {
  let query: admin.firestore.Query = collectionRef(collectionPath);

  if (options?.where) {
    for (const filter of options.where) {
      query = query.where(filter.field, filter.op as FirestoreWhereFilterOp, filter.value);
    }
  }

  if (options?.orderBy) {
    for (const order of options.orderBy) {
      query = query.orderBy(order.field, DIRECTION_MAP[order.direction] || 'asc');
    }
  }

  if (options?.startAt) {
    query = query.startAt(...options.startAt);
  }
  if (options?.startAfter) {
    query = query.startAfter(...options.startAfter);
  }
  if (options?.endAt) {
    query = query.endAt(...options.endAt);
  }
  if (options?.endBefore) {
    query = query.endBefore(...options.endBefore);
  }

  if (options?.offset) {
    query = query.offset(options.offset);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as DataObject,
  }));
}

// ---------------------------------------------------------------------------
// Batch writes
// ---------------------------------------------------------------------------

export async function batchWrite(operations: BatchWrite[]): Promise<void> {
  const batch = db().batch();

  for (const op of operations) {
    const ref = collectionRef(op.collectionPath).doc(op.documentId);
    switch (op.type) {
      case 'set':
        if (op.options) {
          batch.set(ref, op.data ?? {}, op.options);
        } else {
          batch.set(ref, op.data ?? {});
        }
        break;
      case 'update':
        batch.update(ref, op.data ?? {});
        break;
      case 'delete':
        batch.delete(ref);
        break;
    }
  }

  await batch.commit();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export async function verifyIdToken(
  idToken: string,
): Promise<admin.auth.DecodedIdToken> {
  return admin.auth().verifyIdToken(idToken);
}
