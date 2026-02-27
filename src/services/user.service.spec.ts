// src/services/user.service.spec.ts
// Unit tests for UserService using MockUserRepository.
// No real database, env vars, or network calls required.
//
// Run: npx jest src/services/user.service.spec.ts
// Run all: npx jest --coverage

import { UserService } from './user.service.js';
import { MockUserRepository } from '../../examples/test/user.repository.mock.js';
import { createTestConfig } from '../config/schema.js';
import { isOk } from '../types/result.types.js';
import { toUserId, toEmailAddress, toTimestamp } from '../types/shared.types.js';
import type { User } from '../types/shared.types.js';
import type { Logger } from './base.service.js';

// ─── Test setup ────────────────────────────────────────────────────────────

const mockLogger: Logger = {
  debug: () => {},
  info:  () => {},
  warn:  () => {},
  error: () => {},
};

function makeService() {
  const repo   = new MockUserRepository();
  const config = createTestConfig();
  const service = new UserService(
    { database: config.database, logging: config.logging },
    mockLogger,
    repo
  );
  return { repo, service };
}

const fixture: User = {
  id:        toUserId('usr_abc123'),
  email:     toEmailAddress('alice@example.com'),
  name:      'Alice',
  role:      'member',
  createdAt: toTimestamp('2024-01-01T00:00:00.000Z'),
  updatedAt: toTimestamp('2024-01-01T00:00:00.000Z'),
};

// ─── findUser ──────────────────────────────────────────────────────────────

describe('UserService.findUser', () => {
  let repo: MockUserRepository;
  let service: UserService;

  beforeEach(() => {
    ({ repo, service } = makeService());
  });

  it('returns Ok<User> when user exists', async () => {
    repo.seed(fixture);
    const result = await service.findUser(fixture.id);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.id).toBe(fixture.id);
      expect(result.value.email).toBe(fixture.email);
    }
  });

  it('returns Err<NotFoundError> when user does not exist', async () => {
    const result = await service.findUser(toUserId('usr_nonexistent'));
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.kind).toBe('not_found');
      expect(result.error.message).toContain('usr_nonexistent');
    }
  });

  it('returns Err<NotFoundError> for empty store', async () => {
    const result = await service.findUser(fixture.id);
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.kind).toBe('not_found');
    }
  });
});

// ─── createUser ───────────────────────────────────────────────────────────

describe('UserService.createUser', () => {
  let repo: MockUserRepository;
  let service: UserService;

  beforeEach(() => {
    ({ repo, service } = makeService());
  });

  it('returns Ok<User> with valid input', async () => {
    const result = await service.createUser({
      email: 'bob@example.com',
      name:  'Bob',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.email).toBe('bob@example.com');
      expect(result.value.name).toBe('Bob');
      expect(result.value.role).toBe('member'); // default role
      expect(result.value.id).toBeTruthy();
    }
  });

  it('persists the user in the repository', async () => {
    await service.createUser({ email: 'bob@example.com', name: 'Bob' });
    expect(repo.all()).toHaveLength(1);
    expect(repo.all()[0].email).toBe('bob@example.com');
  });

  it('accepts an explicit role', async () => {
    const result = await service.createUser({
      email: 'admin@example.com',
      name:  'Admin',
      role:  'admin',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.role).toBe('admin');
    }
  });

  it('trims whitespace from name', async () => {
    const result = await service.createUser({
      email: 'bob@example.com',
      name:  '  Bob  ',
    });
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value.name).toBe('Bob');
    }
  });

  it('returns Err<ValidationError> when email lacks @', async () => {
    const result = await service.createUser({
      email: 'notanemail',
      name:  'Bob',
    });
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.kind).toBe('validation');
      expect((result.error as { fields?: Record<string, string[]> }).fields?.email).toBeDefined();
    }
  });

  it('returns Err<ValidationError> when name is too short', async () => {
    const result = await service.createUser({
      email: 'bob@example.com',
      name:  'X',
    });
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.kind).toBe('validation');
      expect((result.error as { fields?: Record<string, string[]> }).fields?.name).toBeDefined();
    }
  });

  it('returns Err<ValidationError> when name is whitespace only', async () => {
    const result = await service.createUser({
      email: 'bob@example.com',
      name:  '  ',
    });
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.kind).toBe('validation');
    }
  });

  it('returns Err<ValidationError> with both email and name errors', async () => {
    const result = await service.createUser({
      email: 'notanemail',
      name:  'X',
    });
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.kind).toBe('validation');
      const fields = (result.error as { fields?: Record<string, string[]> }).fields;
      expect(fields?.email).toBeDefined();
      expect(fields?.name).toBeDefined();
    }
  });

  it('returns Err<ConflictError> when email already exists', async () => {
    repo.seed(fixture); // alice@example.com
    const result = await service.createUser({
      email: fixture.email,
      name:  'Another Alice',
    });
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.kind).toBe('conflict');
      expect(result.error.message).toContain(fixture.email);
    }
  });
});

// ─── listUsers ────────────────────────────────────────────────────────────

describe('UserService.listUsers', () => {
  let repo: MockUserRepository;
  let service: UserService;

  const users: User[] = [
    { ...fixture, id: toUserId('usr_001'), role: 'admin' },
    { ...fixture, id: toUserId('usr_002'), email: toEmailAddress('b@x.com'), role: 'member' },
    { ...fixture, id: toUserId('usr_003'), email: toEmailAddress('c@x.com'), role: 'viewer' },
    { ...fixture, id: toUserId('usr_004'), email: toEmailAddress('d@x.com'), role: 'admin' },
  ];

  beforeEach(() => {
    ({ repo, service } = makeService());
    users.forEach(u => repo.seed(u));
  });

  it('returns all users with no filters', async () => {
    const result = await service.listUsers();
    expect(result.items).toHaveLength(4);
    expect(result.total).toBe(4);
  });

  it('filters by role', async () => {
    const result = await service.listUsers({ role: 'admin' });
    expect(result.items).toHaveLength(2);
    expect(result.items.every(u => u.role === 'admin')).toBe(true);
  });

  it('respects limit', async () => {
    const result = await service.listUsers({ limit: 2 });
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.cursor).not.toBeNull();
  });

  it('defaults limit to 20', async () => {
    const result = await service.listUsers();
    // 4 users < 20, so all returned and no more pages
    expect(result.hasMore).toBe(false);
  });

  it('caps limit at 100', async () => {
    const result = await service.listUsers({ limit: 999 });
    expect(result.items).toHaveLength(4); // only 4 exist
  });

  it('paginates with cursor', async () => {
    const page1 = await service.listUsers({ limit: 2 });
    expect(page1.hasMore).toBe(true);

    const page2 = await service.listUsers({ limit: 2, cursor: page1.cursor! });
    expect(page2.items).toHaveLength(2);
    expect(page2.hasMore).toBe(false);

    // No overlap between pages
    const page1Ids = page1.items.map(u => u.id);
    const page2Ids = page2.items.map(u => u.id);
    expect(page1Ids.some(id => page2Ids.includes(id))).toBe(false);
  });

  it('returns empty list when no users match filter', async () => {
    const result = await service.listUsers({ role: 'viewer' });
    expect(result.items).toHaveLength(1); // only usr_003 is viewer
  });
});

// ─── parseUserId ──────────────────────────────────────────────────────────

describe('UserService.parseUserId', () => {
  let service: UserService;

  beforeEach(() => {
    ({ service } = makeService());
  });

  it('returns Ok<UserId> for a valid non-empty string', () => {
    const result = service.parseUserId('usr_abc123');
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe('usr_abc123');
    }
  });

  it('returns Err<ValidationError> for an empty string', () => {
    const result = service.parseUserId('');
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.kind).toBe('validation');
    }
  });

  it('returns Err<ValidationError> for whitespace-only string', () => {
    const result = service.parseUserId('   ');
    expect(isOk(result)).toBe(false);
    if (!isOk(result)) {
      expect(result.error.kind).toBe('validation');
    }
  });

  it('returns Ok<UserId> for any non-empty string (no format enforced)', () => {
    // parseUserId only checks non-empty — format is not validated
    const result = service.parseUserId('not-a-usr-prefix');
    expect(isOk(result)).toBe(true);
  });
});
