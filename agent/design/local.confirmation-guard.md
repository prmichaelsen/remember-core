# Confirmation Guard System

**Concept**: Two-layer protection system preventing agents from auto-confirming protected operations without genuine user involvement
**Created**: 2026-03-20
**Status**: Design Specification

---

## Overview

The confirmation guard system adds security layers to the existing `ConfirmationTokenService` flow. Currently, when a protected operation (publish/retract/revise) creates a confirmation token, an autonomous agent can immediately call `confirm()` or `deny()` without any user involvement. The guard system ensures that confirmations require provable user interaction.

The system consists of two layers:
1. **Secret token challenge** — a per-request HMAC-derived secret that only the user's client can produce
2. **Cooldown with exponential backoff** — configurable initial delay + escalating penalties for failed attempts

---

## Problem Statement

- Autonomous agents (LLMs) can call `remember_confirm` or `remember_deny` immediately after requesting a protected operation, without waiting for user input
- The current token system only validates that a token exists and hasn't expired — it doesn't validate that a human approved the action
- An agent could publish, retract, or revise memories without the user ever seeing the confirmation prompt
- In bulk scenarios, agents may create 5-10 confirmable requests in a single tool loop and confirm them all without user review

---

## Solution

### Layer 1: Secret Token Challenge (Primary Security)

A per-request secret token derived via HMAC from a platform secret that the agent does not have access to.

**Flow:**
1. Agent calls a protected tool (publish/retract/revise)
2. Server creates `ConfirmationRequest` and derives a secret: `HMAC-SHA256(platform_secret, token + created_at)`
3. Server stores the secret on the `ConfirmationRequest` doc (or can recompute it deterministically)
4. Server returns `{ token }` to the MCP adapter — the secret is NOT exposed to the agent
5. The user's client independently computes the same secret (it knows `platform_secret` + `token` + `created_at`)
6. Client embeds the secret in the user's next message as `<secret-token>...</secret-token>`
7. Agent reads the secret from the user's message and passes it as `secret_token` to `remember_confirm` / `remember_deny`
8. Server validates: does `secret_token` match the stored/recomputed value?

**Why this works:**
- The agent cannot compute the secret — it doesn't have `platform_secret`
- The agent can only obtain the secret by reading a user message containing it
- This inherently proves user interaction (the denylist layer collapses into this)
- No time-based rotation needed — the secret is per-request and static
- No clock sync issues

### Layer 2: Cooldown with Exponential Backoff (Attack Mitigation)

Configurable initial cooldown + escalating penalties on failed secret token attempts.

**Behavior:**
- `cooldownSeconds` (default: 5, remember-mcp sets to 0): Initial delay after token creation before confirm/deny is accepted
- `backoffBaseSeconds` (default: 5): Base interval for exponential backoff on failed attempts
- On each failed attempt: `cooldown_until = now + (backoffBaseSeconds * 2^failed_attempts)`
- `maxFailedAttempts` (default: 5): After this many failures, token status is set to `'expired'`

**Example backoff progression** (backoffBaseSeconds=5):
| Attempt | Cooldown | Cumulative |
|---|---|---|
| 1st failure | 5s | 5s |
| 2nd failure | 10s | ~15s |
| 3rd failure | 20s | ~35s |
| 4th failure | 40s | ~75s |
| 5th failure | Token expired | Permanent |

**remember-mcp configuration**: `cooldownSeconds = 0`, `backoffBaseSeconds = 5`. Valid requests execute instantly; bad attempts trigger escalating delays.

---

## Implementation

### New Service: `ConfirmationGuardService`

A new service that composes with the existing `ConfirmationTokenService`. The guard is stateful (in-memory denylist) while the token service remains stateless (Firestore CRUD).

```typescript
// src/services/confirmation-guard.service.ts

import { createHmac } from 'node:crypto';
import type { Logger } from '../utils/logger.js';
import type { ConfirmationTokenService } from './confirmation-token.service.js';

export interface ConfirmationGuardConfig {
  cooldownSeconds: number;       // initial wait after token creation (default: 5)
  backoffBaseSeconds: number;    // base for exponential backoff on failures (default: 5)
  maxFailedAttempts: number;     // terminal invalidation threshold (default: 5)
  platformSecret: string;        // shared secret for HMAC derivation
}

export const DEFAULT_GUARD_CONFIG: Omit<ConfirmationGuardConfig, 'platformSecret'> = {
  cooldownSeconds: 5,
  backoffBaseSeconds: 5,
  maxFailedAttempts: 5,
};

export class ConfirmationGuardService {
  private readonly config: ConfirmationGuardConfig;
  private readonly interactedTokens: Map<string, Set<string>>; // userId → set of tokens
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
   * Both server and client compute this independently.
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
   * Returns { valid: true } or { valid: false, error: string }.
   */
  async validateGuard(
    userId: string,
    token: string,
    secretToken: string,
  ): Promise<{ valid: true } | { valid: false; error: string }> {
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
      // Increment failed attempts, apply exponential backoff
      const failedAttempts = (request.failed_attempts ?? 0) + 1;

      if (failedAttempts >= this.config.maxFailedAttempts) {
        // Terminal invalidation
        await this.confirmationTokenService.updateRequestFields(userId, request.request_id, {
          status: 'expired',
          failed_attempts: failedAttempts,
        });
        return { valid: false, error: 'Token invalidated after too many failed attempts.' };
      }

      const backoffMs = this.config.backoffBaseSeconds * Math.pow(2, failedAttempts - 1) * 1000;
      const newCooldownUntil = new Date(Date.now() + backoffMs).toISOString();

      await this.confirmationTokenService.updateRequestFields(userId, request.request_id, {
        failed_attempts: failedAttempts,
        cooldown_until: newCooldownUntil,
      });

      this.logger.warn('Secret token mismatch', {
        service: 'ConfirmationGuardService',
        userId,
        token,
        failedAttempts,
        cooldownUntil: newCooldownUntil,
      });

      return { valid: false, error: 'Invalid secret token.' };
    }

    return { valid: true };
  }
}
```

### Schema Changes: `ConfirmationRequest`

The `ConfirmationRequest` interface gains three new fields:

```typescript
export interface ConfirmationRequest {
  // ... existing fields ...
  user_id: string;
  token: string;
  action: string;
  target_collection?: string;
  payload: any;
  created_at: string;
  expires_at: string;
  status: 'pending' | 'confirmed' | 'denied' | 'expired' | 'retracted';
  confirmed_at?: string;

  // ── New guard fields ──
  cooldown_until?: string;    // ISO 8601 — earliest time confirm/deny is accepted
  failed_attempts?: number;   // count of failed guard validations (default 0)
  secret_hash?: string;       // stored HMAC for validation (or recomputed from platform_secret)
}
```

### Changes to `ConfirmationTokenService`

Minimal changes to the existing service:

1. **`createRequest()`** — set `cooldown_until` to `created_at + cooldownSeconds` and `failed_attempts` to 0
2. **New `updateRequestFields()`** — generic partial update for guard-related fields (cooldown_until, failed_attempts, status)
3. No other changes — the guard service handles all new logic

### Changes to `SpaceService`

The `ConfirmInput` and `DenyInput` types gain a `secret_token` field:

```typescript
export interface ConfirmInput {
  token: string;
  secret_token: string;  // HMAC-derived secret from user message
}

export interface DenyInput {
  token: string;
  secret_token: string;  // HMAC-derived secret from user message
}
```

The `confirm()` and `deny()` methods call `guardService.validateGuard()` before proceeding.

### Adapter Integration (MCP / REST)

The adapter layer:
1. Receives `platform_secret` from config / env var
2. Instantiates `ConfirmationGuardService` with config
3. On tool listing: checks `guardService.isConfirmAvailable(userId, token)` to decide whether to list `remember_confirm` / `remember_deny`
4. On user message: parses `<secret-token>...</secret-token>` tags, calls `guardService.markUserInteracted(userId, token)` for each
5. On confirm/deny call: passes `secret_token` through to the guard

### Client Integration

The user's client app:
1. Knows the `platform_secret` (shared config)
2. When a confirmable response arrives with `{ token }`, computes `HMAC-SHA256(platform_secret, token + created_at)`
3. Embeds the secret in the user's next message: `<secret-token>computed_secret</secret-token>`
4. The agent reads this from the message and passes it to `remember_confirm` / `remember_deny`

---

## Benefits

- **Agent-proof**: Agents cannot bypass the guard without the platform secret
- **Zero false positives**: Valid requests with correct secrets execute instantly (when cooldown=0)
- **Attack mitigation**: Exponential backoff punishes brute-force or malicious attempts
- **Configurable**: Different consumers can tune cooldown, backoff, and max attempts
- **Minimal API change**: Only adds `secret_token` to ConfirmInput/DenyInput
- **No clock sync**: Secret is deterministic from token + created_at, no time buckets

---

## Trade-offs

- **Platform secret management**: Both server and client must securely share `platform_secret`. If it leaks, all confirmations for that deployment are compromised until rotated.
- **Client coupling**: The client must implement the HMAC computation and `<secret-token>` embedding. Non-standard clients need to implement this protocol.
- **In-memory denylist**: The `isConfirmAvailable` check is lost on server restart. Mitigated by the secret token challenge being the real security layer.

---

## Dependencies

- `node:crypto` — HMAC-SHA256 (already available, no new dependencies)
- Existing `ConfirmationTokenService` — composed, not replaced
- Firestore — for `cooldown_until` and `failed_attempts` fields on `ConfirmationRequest`

---

## Testing Strategy

- **Unit tests** (`confirmation-guard.service.spec.ts`):
  - `computeSecretToken()` produces consistent output for same inputs
  - `computeSecretToken()` produces different output for different tokens
  - `markUserInteracted()` / `isConfirmAvailable()` tracks per-token state
  - `validateGuard()` rejects invalid secret tokens
  - `validateGuard()` enforces cooldown period
  - `validateGuard()` applies exponential backoff on failures
  - `validateGuard()` expires token after max failed attempts
  - `validateGuard()` accepts valid secret token after cooldown
- **Integration with SpaceService**: Confirm/deny require valid secret_token
- **E2E**: Full publish → user message with secret → confirm flow

---

## Migration Path

1. Add `cooldown_until`, `failed_attempts`, `secret_hash` fields to `ConfirmationRequest` (backward compatible — all optional)
2. Add `ConfirmationGuardService` as new service
3. Add `updateRequestFields()` to `ConfirmationTokenService`
4. Update `createRequest()` to set initial `cooldown_until`
5. Update `ConfirmInput` / `DenyInput` with `secret_token` field
6. Wire guard into `SpaceService.confirm()` and `SpaceService.deny()`
7. Export from barrel
8. Adapter layer (remember-mcp) updates separately

---

## Key Design Decisions

### Security Model

| Decision | Choice | Rationale |
|---|---|---|
| Secret derivation | Per-request HMAC-SHA256 | Eliminates clock sync; each token has isolated secret |
| Secret input | `platform_secret` shared between server and client | Agent never has access; deterministic on both sides |
| Time-based rotation | Not used | Per-request secret makes rotation unnecessary |
| Layer 1 (denylist) | Collapses into Layer 3 | Valid secret inherently proves user interaction |

### Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Service design | New `ConfirmationGuardService` composing with existing `ConfirmationTokenService` | Clean separation: guard is stateful, token service stays stateless |
| Denylist granularity | Per-token | Bulk confirmations (5-10) need independent tracking to avoid false failures |
| Denylist storage | In-memory `Map` | Cooldown + secret are the real guards; denylist is UX convenience |
| Config pattern | Constructor config object | Matches `RemConfig`, `AbstractionConfig` pattern; adapter passes env values |

### Cooldown & Backoff

| Decision | Choice | Rationale |
|---|---|---|
| Initial cooldown | Configurable, remember-mcp sets to 0 | No delay for valid requests; other consumers can set their own |
| Backoff base | Separate `backoffBaseSeconds` config | Needed because `cooldownSeconds=0` would make `0 * 2^n = 0` |
| Cooldown storage | Mutable `cooldown_until` field in Firestore | Enables future extensions like adaptive cooldown resets |
| Failed attempt tracking | `failed_attempts` counter on ConfirmationRequest | Enables exponential backoff + terminal invalidation |
| Guard scope | Both confirm AND deny | User must express intent for either action |

---

## Future Considerations

- Adaptive cooldown resets based on trust patterns
- Rate limiting at the user level (across all tokens)
- Audit log of guard failures for security monitoring
- Client SDK helper for computing secret tokens
- WebSocket push of secret token to avoid polling

---

**Status**: Design Specification
**Recommendation**: Implement as new milestone or tasks within current milestone
**Related Documents**:
- `agent/clarifications/clarification-25-confirmation-guard-system.md` — Full requirements clarification
- `src/services/confirmation-token.service.ts` — Existing token service (composed)
- `src/services/space.service.ts` — Consumer of confirm/deny flow
- `agent/design/ghost-persona-system.md` — Related trust system
