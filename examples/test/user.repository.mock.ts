// examples/test/user.repository.mock.ts
// Pattern: Testing Mocks (core-sdk.testing-mocks.md)
//
// In-memory UserRepository for integration tests.
// Pre-seeded with fixture data via seed().
// Reset between tests via reset() to isolate state.
//
// No real database, network calls, or file I/O — safe for CI.

import { UserRepository } from '../../src/services';
import { User, UserId, toUserId } from '../../src/types';

export class MockUserRepository implements UserRepository {
  private store = new Map<string, User>();

  /** Clear all stored users. Call in beforeEach to isolate test state. */
  reset(): void {
    this.store.clear();
  }

  /**
   * Pre-seed a user into the store.
   * Use in tests that need existing data (read-path, conflict, etc.).
   */
  seed(user: User): void {
    this.store.set(user.id, user);
  }

  /** Return all stored users (useful for assertions). */
  all(): User[] {
    return Array.from(this.store.values());
  }

  // ── UserRepository implementation ─────────────────────────────────────────

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async findAll(opts: { role?: string; cursor?: string; limit: number }): Promise<{
    users: User[];
    total: number;
    nextCursor: string | null;
  }> {
    let users = Array.from(this.store.values());
    if (opts.role) {
      users = users.filter(u => u.role === opts.role);
    }
    const total = users.length;
    const start = opts.cursor
      ? users.findIndex(u => u.id === opts.cursor) + 1
      : 0;
    const page = users.slice(start, start + opts.limit);
    const last = page[page.length - 1];
    return {
      users: page,
      total,
      nextCursor: page.length === opts.limit && last ? last.id : null,
    };
  }

  async create(input: Omit<User, 'id'>): Promise<User> {
    const id = toUserId(`usr_${Math.random().toString(36).slice(2, 10)}`);
    const user: User = { id, ...input };
    this.store.set(id, user);
    return user;
  }
}
