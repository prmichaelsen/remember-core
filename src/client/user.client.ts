// src/client/user.client.ts
// Pattern: Client Adapter (core-sdk.adapter-client.md)
//
// Typed HTTP client wrapping the user REST endpoints defined in examples/rest/.
// Install this alongside src/ so consumers call typed functions instead of
// writing their own fetch wrappers.
//
// Usage:
//   const client = createUserClient('https://api.example.com');
//   const result = await client.getUser('usr_123');
//   if (isOk(result)) console.log(result.value.name);
//   else console.error(result.error.kind); // 'not_found' | 'validation'

import {
  UserDTO,
  CreateUserInput,
  ListUsersInput,
  PaginatedResult,
} from '../types';
import { Result, ok, err } from '../types/result.types';
import {
  ValidationError,
  NotFoundError,
  ConflictError,
  ExternalError,
} from '../errors';

// ─── Client Interface ────────────────────────────────────────────────────────

export interface UserClient {
  /**
   * Fetch a single user by ID.
   * Returns Err<NotFoundError> for 404, Err<ValidationError> for 400.
   */
  getUser(id: string): Promise<Result<UserDTO, NotFoundError | ValidationError>>;

  /**
   * Create a new user.
   * Returns Err<ValidationError> for 400, Err<ConflictError> for 409.
   */
  createUser(
    input: CreateUserInput
  ): Promise<Result<UserDTO, ValidationError | ConflictError>>;

  /**
   * List users with optional role filter and cursor-based pagination.
   * Throws ExternalError on network/server failure.
   */
  listUsers(opts?: ListUsersInput): Promise<PaginatedResult<UserDTO>>;
}

// ─── Error Body Shape (as sent by examples/rest/error-handler.ts) ────────────

interface ServerErrorBody {
  error: {
    kind: string;
    message: string;
    fields?: Record<string, string[]>;
    retryAfterSeconds?: number;
  };
}

// ─── Internal Helpers ────────────────────────────────────────────────────────

async function parseErrorBody(res: Response): Promise<ServerErrorBody | null> {
  try {
    return (await res.json()) as ServerErrorBody;
  } catch {
    return null;
  }
}

function toNotFoundError(message: string): NotFoundError {
  // Server formats as "${resource} not found: ${id}"
  const match = message.match(/^(.+) not found: (.+)$/);
  return match
    ? new NotFoundError(match[1], match[2])
    : new NotFoundError('resource', message);
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Create a typed REST client for the user endpoints.
 *
 * @param baseUrl  Base URL of the REST server (e.g. "https://api.example.com")
 * @param defaultInit  Optional RequestInit merged into every fetch call
 *                     (useful for auth headers, timeouts, etc.)
 */
export function createUserClient(
  baseUrl: string,
  defaultInit: RequestInit = {}
): UserClient {
  const base = baseUrl.replace(/\/$/, '');

  function mergedInit(extra: RequestInit = {}): RequestInit {
    return {
      ...defaultInit,
      ...extra,
      headers: {
        'Content-Type': 'application/json',
        ...(defaultInit.headers as Record<string, string> | undefined),
        ...(extra.headers as Record<string, string> | undefined),
      },
    };
  }

  return {
    // ── GET /api/users/:id ──────────────────────────────────────────────────
    async getUser(
      id: string
    ): Promise<Result<UserDTO, NotFoundError | ValidationError>> {
      let res: Response;
      try {
        res = await fetch(`${base}/api/users/${encodeURIComponent(id)}`, mergedInit());
      } catch (e) {
        return err(new ExternalError(`Network error: ${(e as Error).message}`, base) as never);
      }

      if (res.ok) {
        return ok((await res.json()) as UserDTO);
      }

      const body = await parseErrorBody(res);
      const kind = body?.error.kind;
      const message = body?.error.message ?? res.statusText;

      if (kind === 'not_found') return err(toNotFoundError(message));
      if (kind === 'validation') return err(new ValidationError(message, body!.error.fields));

      // Unexpected error from server — treat as external
      return err(new ExternalError(message, base) as never);
    },

    // ── POST /api/users ─────────────────────────────────────────────────────
    async createUser(
      input: CreateUserInput
    ): Promise<Result<UserDTO, ValidationError | ConflictError>> {
      let res: Response;
      try {
        res = await fetch(`${base}/api/users`, mergedInit({
          method: 'POST',
          body: JSON.stringify(input),
        }));
      } catch (e) {
        return err(new ExternalError(`Network error: ${(e as Error).message}`, base) as never);
      }

      if (res.ok) {
        return ok((await res.json()) as UserDTO);
      }

      const body = await parseErrorBody(res);
      const kind = body?.error.kind;
      const message = body?.error.message ?? res.statusText;

      if (kind === 'validation') return err(new ValidationError(message, body!.error.fields));
      if (kind === 'conflict') return err(new ConflictError(message));

      return err(new ExternalError(message, base) as never);
    },

    // ── GET /api/users ──────────────────────────────────────────────────────
    async listUsers(opts: ListUsersInput = {}): Promise<PaginatedResult<UserDTO>> {
      const params = new URLSearchParams();
      if (opts.role)   params.set('role',   opts.role);
      if (opts.cursor) params.set('cursor', opts.cursor);
      if (opts.limit != null) params.set('limit', String(opts.limit));

      const query = params.toString() ? `?${params.toString()}` : '';

      let res: Response;
      try {
        res = await fetch(`${base}/api/users${query}`, mergedInit());
      } catch (e) {
        throw new ExternalError(`Network error: ${(e as Error).message}`, base);
      }

      if (!res.ok) {
        const body = await parseErrorBody(res);
        throw new ExternalError(body?.error.message ?? res.statusText, base);
      }

      return (await res.json()) as PaginatedResult<UserDTO>;
    },
  };
}
