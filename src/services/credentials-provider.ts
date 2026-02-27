/**
 * Credentials Provider.
 *
 * Ported from remember-mcp/src/services/credentials-provider.ts.
 * Resolves user credentials (group memberships, permissions) from an access token.
 * Currently uses a stub implementation; future: HTTP provider.
 */

import type { CredentialsProvider, UserCredentials } from '../types/auth.types.js';

/**
 * Stub credentials provider — returns empty group memberships.
 * Used until an HTTP-based provider is wired up.
 */
export class StubCredentialsProvider implements CredentialsProvider {
  async getCredentials(_accessToken: string, userId: string): Promise<UserCredentials> {
    return {
      user_id: userId,
      group_memberships: [],
    };
  }
}

/**
 * Factory to create the appropriate credentials provider.
 * Future: reads config to pick stub vs HTTP implementation.
 */
export function createCredentialsProvider(): CredentialsProvider {
  return new StubCredentialsProvider();
}

/**
 * Singleton credentials provider instance.
 */
export const credentialsProvider = createCredentialsProvider();
