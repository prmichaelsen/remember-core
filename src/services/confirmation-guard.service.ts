/**
 * Confirmation Guard Service.
 *
 * Two-layer protection preventing agents from auto-confirming
 * protected operations without genuine user involvement.
 *
 * Layer 1: HMAC-derived secret token challenge
 * Layer 2: Cooldown with exponential backoff on failures
 */

import { createHmac } from 'node:crypto';
import type { Logger } from '../utils/logger.js';
import type { ConfirmationTokenService, ConfirmationRequest } from './confirmation-token.service.js';

export interface ConfirmationGuardConfig {
  /** Initial wait after token creation before confirm/deny is accepted (default: 5) */
  cooldownSeconds: number;
  /** Base interval for exponential backoff on failed attempts (default: 5) */
  backoffBaseSeconds: number;
  /** After this many failures, token is permanently expired (default: 5) */
  maxFailedAttempts: number;
  /** Shared secret for HMAC derivation — must match client */
  platformSecret: string;
}

export const DEFAULT_GUARD_CONFIG: Omit<ConfirmationGuardConfig, 'platformSecret'> = {
  cooldownSeconds: 5,
  backoffBaseSeconds: 5,
  maxFailedAttempts: 5,
};

export type GuardValidationResult =
  | { valid: true }
  | { valid: false; error: string };

export class ConfirmationGuardService {
  private readonly config: ConfirmationGuardConfig;
  private readonly interactedTokens: Map<string, Set<string>>;
  private logger: Logger;

  constructor(
    private confirmationTokenService: ConfirmationTokenService,
    config: ConfirmationGuardConfig,
    logger: Logger,
  ) {
    this.config = { ...DEFAULT_GUARD_CONFIG, ...config };
    this.interactedTokens = new Map();
    this.logger = logger;
  }

  /**
   * Derive the secret token for a confirmation request.
   * Both server and client compute this independently using:
   *   HMAC-SHA256(platformSecret, token + createdAt)
   */
  computeSecretToken(token: string, createdAt: string): string {
    return createHmac('sha256', this.config.platformSecret)
      .update(token + createdAt)
      .digest('hex');
  }

  /**
   * Mark that a user has interacted with a specific token.
   * Called by the adapter layer when it sees a valid secret in a user message.
   */
  markUserInteracted(userId: string, token: string): void {
    if (!this.interactedTokens.has(userId)) {
      this.interactedTokens.set(userId, new Set());
    }
    this.interactedTokens.get(userId)!.add(token);
  }

  /**
   * Check if the confirm/deny tool should be available for a specific token.
   * Used by adapters to decide whether to list the tool.
   */
  isConfirmAvailable(userId: string, token: string): boolean {
    return this.interactedTokens.get(userId)?.has(token) ?? false;
  }

  /**
   * Validate all guard layers before allowing confirm or deny.
   */
  async validateGuard(
    userId: string,
    token: string,
    secretToken: string,
  ): Promise<GuardValidationResult> {
    // 1. Validate the token exists and is pending
    const request = await this.confirmationTokenService.validateToken(userId, token);
    if (!request) {
      return { valid: false, error: 'Invalid or expired confirmation token' };
    }

    // 2. Check cooldown
    if (request.cooldown_until) {
      const cooldownUntil = new Date(request.cooldown_until).getTime();
      const now = Date.now();
      if (now < cooldownUntil) {
        const remainingMs = cooldownUntil - now;
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        return {
          valid: false,
          error: `Confirmation is in cooldown. Try again in ${remainingSeconds} seconds.`,
        };
      }
    }

    // 3. Validate secret token
    const expectedSecret = this.computeSecretToken(token, request.created_at);
    if (secretToken !== expectedSecret) {
      await this.applyBackoff(userId, request);
      return { valid: false, error: 'Invalid secret token.' };
    }

    return { valid: true };
  }

  /**
   * Apply exponential backoff after a failed secret token attempt.
   */
  private async applyBackoff(
    userId: string,
    request: ConfirmationRequest & { request_id: string },
  ): Promise<void> {
    const failedAttempts = (request.failed_attempts ?? 0) + 1;

    if (failedAttempts >= this.config.maxFailedAttempts) {
      await this.confirmationTokenService.updateRequestFields(userId, request.request_id, {
        status: 'expired',
        failed_attempts: failedAttempts,
      });
      this.logger.warn('Token invalidated after max failed attempts', {
        service: 'ConfirmationGuardService',
        userId,
        token: request.token,
        failedAttempts,
      });
      return;
    }

    const backoffMs = this.config.backoffBaseSeconds * Math.pow(2, failedAttempts - 1) * 1000;
    const newCooldownUntil = new Date(Date.now() + backoffMs).toISOString();

    await this.confirmationTokenService.updateRequestFields(userId, request.request_id, {
      failed_attempts: failedAttempts,
      cooldown_until: newCooldownUntil,
    });

    this.logger.warn('Secret token mismatch — backoff applied', {
      service: 'ConfirmationGuardService',
      userId,
      token: request.token,
      failedAttempts,
      cooldownUntil: newCooldownUntil,
    });
  }
}
