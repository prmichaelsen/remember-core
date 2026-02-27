// src/client/index.ts
// Pattern: Client Adapter (core-sdk.adapter-client.md)
//
// Usage:
//   const client = createClient({ baseUrl: 'https://api.example.com' });
//   const result = await client.users.getUser('usr_123');
//
// Or destructure if you only need one namespace:
//   const { users } = createClient({ baseUrl });

import { createUserClient, UserClient } from './user.client';

export { createUserClient } from './user.client';
export type { UserClient } from './user.client';

// ─── Top-level SDK client ────────────────────────────────────────────────────

export interface ClientConfig {
  /** Base URL of the REST server (e.g. "https://api.example.com") */
  baseUrl: string;
  /** Optional RequestInit merged into every fetch call (auth headers, etc.) */
  init?: RequestInit;
}

export interface Client {
  users: UserClient;
}

/**
 * Create the top-level SDK client.
 *
 * @example
 * const client = createClient({ baseUrl: 'https://api.example.com' });
 * const result = await client.users.getUser('usr_123');
 *
 * @example
 * // Destructure if you only need one namespace
 * const { users } = createClient({ baseUrl: 'https://api.example.com' });
 */
export function createClient(config: ClientConfig): Client {
  return {
    users: createUserClient(config.baseUrl, config.init),
  };
}
