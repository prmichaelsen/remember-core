/**
 * REM Firestore state persistence.
 *
 * Tracks cursor position and per-collection processing state
 * so REM resumes correctly across invocations.
 */

import { getDocument, setDocument } from '../database/firestore/init.js';
import { BASE } from '../database/firestore/paths.js';
import type { RemCursorState, RemCollectionState } from './rem.types.js';

const REM_STATE_COLLECTION = `${BASE}.rem_state`;

function getCursorPath() {
  return { collectionPath: REM_STATE_COLLECTION, docId: 'cursor' };
}

function getCollectionStatePath(collectionId: string) {
  return { collectionPath: REM_STATE_COLLECTION, docId: collectionId };
}

export class RemStateStore {
  async getCursor(): Promise<RemCursorState | null> {
    const { collectionPath, docId } = getCursorPath();
    const doc = await getDocument(collectionPath, docId);
    if (!doc) return null;
    return doc as unknown as RemCursorState;
  }

  async saveCursor(state: RemCursorState): Promise<void> {
    const { collectionPath, docId } = getCursorPath();
    await setDocument(collectionPath, docId, state as any);
  }

  async getCollectionState(collectionId: string): Promise<RemCollectionState | null> {
    const { collectionPath, docId } = getCollectionStatePath(collectionId);
    const doc = await getDocument(collectionPath, docId);
    if (!doc) return null;
    return doc as unknown as RemCollectionState;
  }

  async saveCollectionState(state: RemCollectionState): Promise<void> {
    const { collectionPath, docId } = getCollectionStatePath(state.collection_id);
    await setDocument(collectionPath, docId, state as any);
  }
}
