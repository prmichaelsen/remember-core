// src/clients/http.ts
// Shared HTTP transport for client SDKs

import { fromHttpResponse, createError } from './response.js';
import type { SdkResponse } from './response.js';

/**
 * Configuration for creating an HTTP client.
 * Supports two auth patterns (either/or):
 * - auth.serviceToken: SDK generates JWT per request (requires jsonwebtoken peer dep)
 * - getAuthToken: Consumer provides token directly
 */
export interface HttpClientConfig {
  baseUrl: string;
  /** Option A: SDK generates JWT per request */
  auth?: {
    serviceToken: string;
    jwtOptions?: {
      issuer?: string;
      audience?: string;
      expiresIn?: string;
    };
  };
  /** Option B: Consumer provides auth token */
  getAuthToken?: (userId: string) => string | Promise<string>;
}

export interface RequestOptions {
  body?: unknown;
  params?: Record<string, string>;
  userId?: string;
}

/**
 * HTTP client that wraps fetch() with auth and JSON handling.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly config: HttpClientConfig;
  private signJwt: ((payload: Record<string, unknown>, secret: string, options?: Record<string, unknown>) => string) | null = null;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.config = config;
  }

  async request<T>(method: string, path: string, options?: RequestOptions): Promise<SdkResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Resolve auth token
    if (options?.userId) {
      try {
        const token = await this.resolveAuthToken(options.userId);
        headers['Authorization'] = `Bearer ${token}`;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return createError({
          code: 'auth_error',
          message: `Failed to resolve auth token: ${message}`,
          status: 0,
        });
      }
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      });

      return fromHttpResponse<T>(response);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return createError({
        code: 'network_error',
        message: `Request failed: ${message}`,
        status: 0,
      });
    }
  }

  private async resolveAuthToken(userId: string): Promise<string> {
    // getAuthToken takes priority
    if (this.config.getAuthToken) {
      return this.config.getAuthToken(userId);
    }

    // serviceToken JWT generation
    if (this.config.auth?.serviceToken) {
      return this.generateJwt(userId);
    }

    throw new Error(
      'No auth configured. Provide either getAuthToken callback or auth.serviceToken.',
    );
  }

  private async generateJwt(userId: string): Promise<string> {
    if (!this.signJwt) {
      try {
        // Dynamic import — jsonwebtoken is an optional peer dependency
        const jwt = await import('jsonwebtoken');
        this.signJwt = jwt.default?.sign ?? jwt.sign;
      } catch {
        throw new Error(
          'jsonwebtoken is required when using auth.serviceToken. ' +
          'Install it: npm install jsonwebtoken',
        );
      }
    }

    const options = this.config.auth!.jwtOptions ?? {};
    return this.signJwt!(
      { sub: userId },
      this.config.auth!.serviceToken,
      {
        ...(options.issuer ? { issuer: options.issuer } : {}),
        ...(options.audience ? { audience: options.audience } : {}),
        expiresIn: options.expiresIn ?? '1h',
      },
    );
  }
}
