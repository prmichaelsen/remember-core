// examples/test/cli.integration.spec.ts
// Pattern: Integration Testing (core-sdk.testing-integration.md)
//
// Integration tests for the CLI adapter (examples/cli/).
// Exercises Commander command handlers without spawning a subprocess.
//
// Strategy:
//   - Build a real Commander program with registerUserCommands
//   - Spy on process.stdout.write / process.stderr.write to capture output
//   - Mock process.exit so it throws instead of terminating the process
//   - Call program.parseAsync(['', '', ...args]) to drive each handler
//
// Exit code convention: 0=success (no exit call), 1=app error, 2=usage/config

import { Command } from 'commander';
import { createTestConfig } from '../../src/config/schema';
import { UserService } from '../../src/services';
import { toUserId, toEmailAddress, toTimestamp, User } from '../../src/types';
import { registerUserCommands } from '../cli/user.commands';
import { MockUserRepository } from './user.repository.mock';

// ─── Test Setup ───────────────────────────────────────────────────────────────

function makeLogger() {
  return {
    debug: jest.fn(),
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  const now = toTimestamp(new Date().toISOString());
  return {
    id:        toUserId('usr_testuser1'),
    email:     toEmailAddress('alice@example.com'),
    name:      'Alice',
    role:      'member',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ─── Output Capture ──────────────────────────────────────────────────────────

interface OutputCapture {
  stdout: string;
  stderr: string;
  exitCode: number | undefined;
}

function makeCapture(): OutputCapture {
  return { stdout: '', stderr: '', exitCode: undefined };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('CLI commands (integration)', () => {
  let repo: MockUserRepository;
  let service: UserService;
  let program: Command;
  let out: OutputCapture;

  beforeAll(async () => {
    const config = createTestConfig();
    const serviceConfig = { database: config.database, logging: config.logging };
    repo    = new MockUserRepository();
    service = new UserService(serviceConfig, makeLogger(), repo);
    await service.initialize();

    program = new Command();
    program.name('test-cli').exitOverride(); // throws instead of process.exit for parse errors
    registerUserCommands(program, service);
  });

  afterAll(async () => {
    await service.shutdown();
  });

  beforeEach(() => {
    out = makeCapture();
    repo.reset();

    // Capture stdout and stderr
    jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      out.stdout += chunk;
      return true;
    });
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      out.stderr += chunk;
      return true;
    });

    // Mock process.exit to throw a recognizable error so the test can inspect
    // the exit code without terminating the process.
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      out.exitCode = (code as number) ?? 0;
      throw Object.assign(new Error(`process.exit(${code})`), { isTestExit: true });
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Helper: run args through Commander; swallow test-exit errors
  async function run(...args: string[]): Promise<void> {
    try {
      await program.parseAsync(['', '', ...args]);
    } catch (e) {
      // Only re-throw unexpected errors; test-exit throws are expected
      if (!(e as { isTestExit?: boolean }).isTestExit) {
        throw e;
      }
    }
  }

  // ── user get ──────────────────────────────────────────────────────────────

  describe('user get <id>', () => {
    it('prints UserDTO JSON to stdout for a known user', async () => {
      const user = makeUser();
      repo.seed(user);

      await run('user', 'get', user.id);

      expect(out.exitCode).toBeUndefined(); // no exit call
      const dto = JSON.parse(out.stdout);
      expect(dto.id).toBe(user.id);
      expect(dto.email).toBe(user.email);
      expect(dto.name).toBe(user.name);
    });

    it('prints error to stderr and exits 1 for an unknown user', async () => {
      await run('user', 'get', 'usr_nonexistent');

      expect(out.exitCode).toBe(1);
      expect(out.stderr).toContain('not_found');
      expect(out.stdout).toBe('');
    });

    it('prints error to stderr and exits 1 for an empty ID', async () => {
      // Empty string fails parseUserId
      await run('user', 'get', '');

      expect(out.exitCode).toBe(1);
      expect(out.stderr).toContain('validation');
    });
  });

  // ── user create ───────────────────────────────────────────────────────────

  describe('user create <email> <name>', () => {
    it('creates a user and prints UserDTO JSON to stdout', async () => {
      await run('user', 'create', 'bob@example.com', 'Bob');

      expect(out.exitCode).toBeUndefined();
      const dto = JSON.parse(out.stdout);
      expect(dto.email).toBe('bob@example.com');
      expect(dto.name).toBe('Bob');
      expect(dto.role).toBe('member');
      expect(dto.id).toBeDefined();
    });

    it('creates a user with --role admin', async () => {
      await run('user', 'create', 'admin@example.com', 'Admin User', '--role', 'admin');

      expect(out.exitCode).toBeUndefined();
      const dto = JSON.parse(out.stdout);
      expect(dto.role).toBe('admin');
    });

    it('prints validation error to stderr and exits 1 for invalid email', async () => {
      await run('user', 'create', 'not-an-email', 'Bob');

      expect(out.exitCode).toBe(1);
      expect(out.stderr).toContain('validation');
      expect(out.stdout).toBe('');
    });

    it('prints validation error to stderr and exits 1 for short name', async () => {
      await run('user', 'create', 'bob@example.com', 'B');

      expect(out.exitCode).toBe(1);
      expect(out.stderr).toContain('validation');
    });

    it('prints conflict error to stderr and exits 1 for duplicate email', async () => {
      repo.seed(makeUser({ email: toEmailAddress('alice@example.com') }));

      await run('user', 'create', 'alice@example.com', 'Alice Again');

      expect(out.exitCode).toBe(1);
      expect(out.stderr).toContain('conflict');
    });
  });

  // ── user list ─────────────────────────────────────────────────────────────

  describe('user list', () => {
    it('prints a formatted table to stdout when users exist', async () => {
      repo.seed(makeUser({ id: toUserId('usr_a'), email: toEmailAddress('a@example.com') }));
      repo.seed(makeUser({ id: toUserId('usr_b'), email: toEmailAddress('b@example.com'), role: 'admin' }));

      await run('user', 'list');

      expect(out.exitCode).toBeUndefined();
      expect(out.stdout).toContain('usr_a');
      expect(out.stdout).toContain('Total: 2');
    });

    it('prints JSON when --json flag is set', async () => {
      repo.seed(makeUser({ id: toUserId('usr_j'), email: toEmailAddress('j@example.com') }));

      await run('user', 'list', '--json');

      expect(out.exitCode).toBeUndefined();
      const data = JSON.parse(out.stdout);
      expect(data.items).toHaveLength(1);
      expect(data.total).toBe(1);
    });

    it('prints "(no results)" table entry when empty', async () => {
      await run('user', 'list');

      expect(out.exitCode).toBeUndefined();
      // printTable writes "(no results)" when rows are empty
      expect(out.stdout).toContain('no results');
    });

    it('filters by --role', async () => {
      repo.seed(makeUser({ id: toUserId('usr_adm'), email: toEmailAddress('adm@example.com'), role: 'admin' }));
      repo.seed(makeUser({ id: toUserId('usr_mem'), email: toEmailAddress('mem@example.com'), role: 'member' }));

      await run('user', 'list', '--json', '--role', 'admin');

      const data = JSON.parse(out.stdout);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].role).toBe('admin');
    });

    it('respects --limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        repo.seed(makeUser({
          id:    toUserId(`usr_lim${i}`),
          email: toEmailAddress(`lim${i}@example.com`),
        }));
      }

      await run('user', 'list', '--json', '--limit', '2');

      const data = JSON.parse(out.stdout);
      expect(data.items).toHaveLength(2);
      expect(data.total).toBe(5);
    });
  });
});
