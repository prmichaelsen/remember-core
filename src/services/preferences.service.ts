/**
 * Preferences Database Service.
 *
 * Ported from remember-mcp/src/services/preferences-database.service.ts.
 * Handles Firestore operations for user preferences.
 * Design: uses imported Firestore helpers and path utilities from database modules.
 */

import { getDocument, setDocument } from '../database/firestore/init.js';
import { getUserPreferencesPath } from '../database/firestore/paths.js';
import type { Logger } from '../utils/logger.js';
import type { UserPreferences } from '../types/preferences.types.js';
import { DEFAULT_PREFERENCES } from '../types/preferences.types.js';

export class PreferencesDatabaseService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Get user preferences. Returns defaults if preferences don't exist.
   */
  async getPreferences(userId: string): Promise<UserPreferences> {
    try {
      const pathParts = getUserPreferencesPath(userId).split('/');
      const docId = pathParts.pop()!;
      const collectionPath = pathParts.join('/');

      const doc = await getDocument(collectionPath, docId);

      if (!doc) {
        const now = new Date().toISOString();
        return {
          user_id: userId,
          ...DEFAULT_PREFERENCES,
          created_at: now,
          updated_at: now,
        };
      }

      return doc as UserPreferences;
    } catch (error) {
      this.logger.error('Failed to get preferences', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to get preferences: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update user preferences (partial update with merge).
   * Creates with defaults if preferences don't exist.
   */
  async updatePreferences(
    userId: string,
    updates: Partial<Omit<UserPreferences, 'user_id' | 'created_at'>>,
  ): Promise<UserPreferences> {
    try {
      const pathParts = getUserPreferencesPath(userId).split('/');
      const docId = pathParts.pop()!;
      const collectionPath = pathParts.join('/');

      const now = new Date().toISOString();
      const doc = await getDocument(collectionPath, docId);

      if (!doc) {
        const newPrefs: UserPreferences = {
          user_id: userId,
          ...DEFAULT_PREFERENCES,
          ...updates,
          created_at: now,
          updated_at: now,
        };
        await setDocument(collectionPath, docId, newPrefs);
        this.logger.info('Preferences created with defaults', { userId });
        return newPrefs;
      }

      const updateData = { ...updates, updated_at: now };
      await setDocument(collectionPath, docId, updateData, { merge: true });
      this.logger.info('Preferences updated', { userId });

      const updatedDoc = await getDocument(collectionPath, docId);
      return updatedDoc as UserPreferences;
    } catch (error) {
      this.logger.error('Failed to update preferences', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to update preferences: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create preferences with defaults.
   */
  async createPreferences(userId: string): Promise<UserPreferences> {
    try {
      const pathParts = getUserPreferencesPath(userId).split('/');
      const docId = pathParts.pop()!;
      const collectionPath = pathParts.join('/');

      const now = new Date().toISOString();
      const preferences: UserPreferences = {
        user_id: userId,
        ...DEFAULT_PREFERENCES,
        created_at: now,
        updated_at: now,
      };

      await setDocument(collectionPath, docId, preferences);
      this.logger.info('Preferences created', { userId });
      return preferences;
    } catch (error) {
      this.logger.error('Failed to create preferences', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to create preferences: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
