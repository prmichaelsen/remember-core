import { createHmac } from 'node:crypto';
import { ConfirmationGuardService, DEFAULT_GUARD_CONFIG } from './confirmation-guard.service.js';
import type { ConfirmationTokenService, ConfirmationRequest } from './confirmation-token.service.js';

// ── Mock helpers ──

const PLATFORM_SECRET = 'test-platform-secret-key-12345';

function createMockLogger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

function createMockTokenService(overrides: Partial<ConfirmationTokenService> = {}): ConfirmationTokenService {
  return {
    createRequest: jest.fn(),
    validateToken: jest.fn(),
    confirmRequest: jest.fn(),
    denyRequest: jest.fn(),
    retractRequest: jest.fn(),
    updateRequestFields: jest.fn(),
    ...overrides,
  } as any;
}

function createPendingRequest(overrides: Partial<ConfirmationRequest & { request_id: string }> = {}): ConfirmationRequest & { request_id: string } {
  return {
    request_id: 'req-123',
    user_id: 'user-1',
    token: 'token-abc',
    action: 'publish_memory',
    payload: {},
    created_at: '2026-03-20T10:00:00.000Z',
    expires_at: '2026-03-20T10:05:00.000Z',
    status: 'pending',
    failed_attempts: 0,
    ...overrides,
  };
}

// ── Tests ──

describe('ConfirmationGuardService', () => {
  let guard: ConfirmationGuardService;
  let tokenService: ConfirmationTokenService;
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
    tokenService = createMockTokenService();
    guard = new ConfirmationGuardService(tokenService, {
      ...DEFAULT_GUARD_CONFIG,
      platformSecret: PLATFORM_SECRET,
    }, logger as any);
  });

  describe('computeSecretToken', () => {
    it('produces consistent output for same inputs', () => {
      const s1 = guard.computeSecretToken('token-1', '2026-03-20T10:00:00.000Z');
      const s2 = guard.computeSecretToken('token-1', '2026-03-20T10:00:00.000Z');
      expect(s1).toBe(s2);
    });

    it('produces different output for different tokens', () => {
      const s1 = guard.computeSecretToken('token-1', '2026-03-20T10:00:00.000Z');
      const s2 = guard.computeSecretToken('token-2', '2026-03-20T10:00:00.000Z');
      expect(s1).not.toBe(s2);
    });

    it('produces different output for different timestamps', () => {
      const s1 = guard.computeSecretToken('token-1', '2026-03-20T10:00:00.000Z');
      const s2 = guard.computeSecretToken('token-1', '2026-03-20T10:01:00.000Z');
      expect(s1).not.toBe(s2);
    });

    it('matches manual HMAC-SHA256 computation', () => {
      const token = 'my-token';
      const createdAt = '2026-03-20T12:00:00.000Z';
      const expected = createHmac('sha256', PLATFORM_SECRET)
        .update(token + createdAt)
        .digest('hex');
      expect(guard.computeSecretToken(token, createdAt)).toBe(expected);
    });
  });

  describe('markUserInteracted / isConfirmAvailable', () => {
    it('returns false before interaction', () => {
      expect(guard.isConfirmAvailable('user-1', 'token-a')).toBe(false);
    });

    it('returns true after interaction for that token', () => {
      guard.markUserInteracted('user-1', 'token-a');
      expect(guard.isConfirmAvailable('user-1', 'token-a')).toBe(true);
    });

    it('tracks per-token — different token is still false', () => {
      guard.markUserInteracted('user-1', 'token-a');
      expect(guard.isConfirmAvailable('user-1', 'token-b')).toBe(false);
    });

    it('tracks per-user — different user is still false', () => {
      guard.markUserInteracted('user-1', 'token-a');
      expect(guard.isConfirmAvailable('user-2', 'token-a')).toBe(false);
    });

    it('handles multiple tokens per user', () => {
      guard.markUserInteracted('user-1', 'token-a');
      guard.markUserInteracted('user-1', 'token-b');
      expect(guard.isConfirmAvailable('user-1', 'token-a')).toBe(true);
      expect(guard.isConfirmAvailable('user-1', 'token-b')).toBe(true);
      expect(guard.isConfirmAvailable('user-1', 'token-c')).toBe(false);
    });
  });

  describe('validateGuard', () => {
    it('rejects when token is invalid/expired', async () => {
      (tokenService.validateToken as jest.Mock).mockResolvedValue(null);

      const result = await guard.validateGuard('user-1', 'bad-token', 'any-secret');
      expect(result).toEqual({ valid: false, error: 'Invalid or expired confirmation token' });
    });

    it('rejects when cooldown has not elapsed', async () => {
      const futureTime = new Date(Date.now() + 30_000).toISOString();
      const request = createPendingRequest({ cooldown_until: futureTime });
      (tokenService.validateToken as jest.Mock).mockResolvedValue(request);

      const result = await guard.validateGuard('user-1', 'token-abc', 'any-secret');
      expect(result.valid).toBe(false);
      expect((result as any).error).toContain('cooldown');
    });

    it('accepts valid secret token after cooldown elapsed', async () => {
      const pastTime = new Date(Date.now() - 1000).toISOString();
      const request = createPendingRequest({ cooldown_until: pastTime });
      (tokenService.validateToken as jest.Mock).mockResolvedValue(request);

      const validSecret = guard.computeSecretToken(request.token, request.created_at);
      const result = await guard.validateGuard('user-1', request.token, validSecret);
      expect(result).toEqual({ valid: true });
    });

    it('accepts valid secret when no cooldown is set', async () => {
      const request = createPendingRequest();
      (tokenService.validateToken as jest.Mock).mockResolvedValue(request);

      const validSecret = guard.computeSecretToken(request.token, request.created_at);
      const result = await guard.validateGuard('user-1', request.token, validSecret);
      expect(result).toEqual({ valid: true });
    });

    it('rejects invalid secret and increments failed_attempts', async () => {
      const request = createPendingRequest({ failed_attempts: 0 });
      (tokenService.validateToken as jest.Mock).mockResolvedValue(request);

      const result = await guard.validateGuard('user-1', 'token-abc', 'wrong-secret');
      expect(result).toEqual({ valid: false, error: 'Invalid secret token.' });
      expect(tokenService.updateRequestFields).toHaveBeenCalledWith(
        'user-1',
        'req-123',
        expect.objectContaining({
          failed_attempts: 1,
          cooldown_until: expect.any(String),
        }),
      );
    });

    it('applies exponential backoff on successive failures', async () => {
      const request = createPendingRequest({ failed_attempts: 2 });
      (tokenService.validateToken as jest.Mock).mockResolvedValue(request);

      await guard.validateGuard('user-1', 'token-abc', 'wrong-secret');

      const call = (tokenService.updateRequestFields as jest.Mock).mock.calls[0];
      const fields = call[2];
      expect(fields.failed_attempts).toBe(3);
      // Backoff: 5 * 2^2 = 20 seconds
      const cooldownTime = new Date(fields.cooldown_until).getTime();
      const expectedMin = Date.now() + 19_000; // ~20s with tolerance
      expect(cooldownTime).toBeGreaterThan(expectedMin);
    });

    it('expires token after max failed attempts', async () => {
      const request = createPendingRequest({ failed_attempts: 4 }); // 4 + 1 = 5 = maxFailedAttempts
      (tokenService.validateToken as jest.Mock).mockResolvedValue(request);

      const result = await guard.validateGuard('user-1', 'token-abc', 'wrong-secret');
      expect(result).toEqual({ valid: false, error: 'Invalid secret token.' });
      expect(tokenService.updateRequestFields).toHaveBeenCalledWith(
        'user-1',
        'req-123',
        expect.objectContaining({
          status: 'expired',
          failed_attempts: 5,
        }),
      );
    });

    it('logs warning on secret mismatch', async () => {
      const request = createPendingRequest();
      (tokenService.validateToken as jest.Mock).mockResolvedValue(request);

      await guard.validateGuard('user-1', 'token-abc', 'wrong-secret');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('mismatch'),
        expect.objectContaining({ service: 'ConfirmationGuardService' }),
      );
    });
  });
});
