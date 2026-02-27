/**
 * Firestore module barrel exports.
 *
 * Provides Firebase Admin SDK initialization and Firestore document path utilities.
 */

export {
  initFirestore,
  isFirestoreInitialized,
  testFirestoreConnection,
  _resetFirestoreState,
  type FirestoreConfig,
  type FirestoreLogger,
  // Re-exported from @prmichaelsen/firebase-admin-sdk-v8
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
} from './init.js';

export {
  BASE,
  getUserPreferencesPath,
  getUserTemplatesPath,
  getUserAccessLogsPath,
  getUserTrustRelationshipsPath,
  getUserPermissionsPath,
  getUserPermissionPath,
  getDefaultTemplatesPath,
  getDefaultTemplatePath,
} from './paths.js';
