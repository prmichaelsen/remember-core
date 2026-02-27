/**
 * Confirmation Token Service.
 *
 * Ported from remember-mcp/src/services/confirmation-token.service.ts.
 * Manages confirmation tokens for sensitive operations.
 * Tokens are one-time use with 5-minute expiry.
 */

import { randomUUID } from 'crypto';
import {
  addDocument,
  updateDocument,
  queryDocuments,
  type QueryOptions,
} from '../database/firestore/init.js';
import type { Logger } from '../utils/logger.js';

/**
 * Confirmation request stored in Firestore.
 */
export interface ConfirmationRequest {
  user_id: string;
  token: string;
  action: string;
  target_collection?: string;
  payload: any;
  created_at: string;
  expires_at: string;
  status: 'pending' | 'confirmed' | 'denied' | 'expired' | 'retracted';
  confirmed_at?: string;
}

export class ConfirmationTokenService {
  private readonly EXPIRY_MINUTES = 5;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Create a new confirmation request.
   */
  async createRequest(
    userId: string,
    action: string,
    payload: any,
    targetCollection?: string,
  ): Promise<{ requestId: string; token: string }> {
    try {
      const token = randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + this.EXPIRY_MINUTES * 60 * 1000);

      const request: ConfirmationRequest = {
        user_id: userId,
        token,
        action,
        target_collection: targetCollection,
        payload,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      };

      const collectionPath = `users/${userId}/requests`;
      const docRef = await addDocument(collectionPath, request);

      if (!docRef?.id) {
        throw new Error('Firestore addDocument returned invalid reference');
      }

      this.logger.info('Confirmation request created', {
        service: 'ConfirmationTokenService',
        requestId: docRef.id,
        expiresAt: request.expires_at,
      });

      return { requestId: docRef.id, token };
    } catch (error) {
      this.logger.error('Failed to create confirmation request', {
        service: 'ConfirmationTokenService',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate and retrieve a confirmation request.
   */
  async validateToken(
    userId: string,
    token: string,
  ): Promise<(ConfirmationRequest & { request_id: string }) | null> {
    const collectionPath = `users/${userId}/requests`;

    const queryOptions: QueryOptions = {
      where: [
        { field: 'token', op: '==', value: token },
        { field: 'status', op: '==', value: 'pending' },
      ],
      limit: 1,
    };

    const results = await queryDocuments(collectionPath, queryOptions);

    if (results.length === 0) {
      return null;
    }

    const doc = results[0];
    const request = doc.data as ConfirmationRequest;

    const expiresAt = new Date(request.expires_at);
    if (expiresAt.getTime() < Date.now()) {
      await this.updateStatus(userId, doc.id, 'expired');
      return null;
    }

    return { ...request, request_id: doc.id };
  }

  /**
   * Confirm a request.
   */
  async confirmRequest(
    userId: string,
    token: string,
  ): Promise<(ConfirmationRequest & { request_id: string }) | null> {
    const request = await this.validateToken(userId, token);
    if (!request) return null;

    await this.updateStatus(userId, request.request_id, 'confirmed');
    return { ...request, status: 'confirmed', confirmed_at: new Date().toISOString() };
  }

  /**
   * Deny a request.
   */
  async denyRequest(userId: string, token: string): Promise<boolean> {
    const request = await this.validateToken(userId, token);
    if (!request) return false;
    await this.updateStatus(userId, request.request_id, 'denied');
    return true;
  }

  /**
   * Retract a request.
   */
  async retractRequest(userId: string, token: string): Promise<boolean> {
    const request = await this.validateToken(userId, token);
    if (!request) return false;
    await this.updateStatus(userId, request.request_id, 'retracted');
    return true;
  }

  private async updateStatus(
    userId: string,
    requestId: string,
    status: ConfirmationRequest['status'],
  ): Promise<void> {
    const collectionPath = `users/${userId}/requests`;
    const updateData: Partial<ConfirmationRequest> = { status };
    if (status === 'confirmed') {
      updateData.confirmed_at = new Date().toISOString();
    }
    await updateDocument(collectionPath, requestId, updateData);
  }
}
