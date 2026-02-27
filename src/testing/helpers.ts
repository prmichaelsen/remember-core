// src/testing/helpers.ts
// Pattern: Testing Mocks + Testing Integration (core-sdk.testing-mocks.md)
//
// Factory helpers for constructing fully-wired test objects without real
// databases, env vars, or network calls. Import these in test files to
// avoid repeating boilerplate setup.
//
// Usage:
//   const { service, repo } = makeTestService();
//   const { app, service, repo } = makeTestApp();

import express, { Application } from 'express';
import { Command } from 'commander';

import { createTestConfig } from '../config/schema.js';
import { UserService } from '../services/user.service.js';
import type { Logger } from '../services/base.service.js';
import type { ServiceConfig } from '../config/schema.js';
import { userRoutes } from '../../examples/rest/user.routes.js';
import { errorHandler } from '../../examples/rest/error-handler.js';
import { registerUserCommands } from '../../examples/cli/user.commands.js';
import { MockUserRepository } from '../../examples/test/user.repository.mock.js';
import type { User } from '../types/shared.types.js';

// ─── Silent Logger ─────────────────────────────────────────────────────────

/**
 * A Logger that discards all output.
 * Use as the logger argument when you don't care about log output in tests.
 */
export const mockLogger: Logger = {
  debug: () => {},
  info:  () => {},
  warn:  () => {},
  error: () => {},
};

// ─── Service Factory ───────────────────────────────────────────────────────

export interface TestServiceResult {
  /** In-memory repository — call reset() in beforeEach, seed() for fixtures. */
  repo: MockUserRepository;
  /** Fully wired UserService backed by MockUserRepository. */
  service: UserService;
  /** Layer-scoped config slice used to construct the service. */
  serviceConfig: ServiceConfig;
}

/**
 * Create a `UserService` backed by a `MockUserRepository` with test config.
 * No database, env vars, or network calls required.
 *
 * @example
 * const { service, repo } = makeTestService();
 * beforeEach(() => repo.reset());
 *
 * it('returns NotFoundError for unknown user', async () => {
 *   const result = await service.findUser(toUserId('usr_unknown'));
 *   expect(isOk(result)).toBe(false);
 *   expect(result.error.kind).toBe('not_found');
 * });
 */
export function makeTestService(seed?: User[]): TestServiceResult {
  const repo   = new MockUserRepository();
  const config = createTestConfig();
  const serviceConfig: ServiceConfig = {
    database: config.database,
    logging:  config.logging,
  };
  const service = new UserService(serviceConfig, mockLogger, repo);
  if (seed) {
    seed.forEach(u => repo.seed(u));
  }
  return { repo, service, serviceConfig };
}

// ─── Express App Factory ───────────────────────────────────────────────────

export interface TestAppResult {
  /** Express application with routes and error handler mounted. */
  app: Application;
  /** In-memory repository — call reset() in beforeEach. */
  repo: MockUserRepository;
  /** The UserService instance powering the routes. */
  service: UserService;
}

/**
 * Create a fully wired Express app for integration testing.
 * Mounts `userRoutes` at `/api/users` and `errorHandler` last.
 *
 * Use with supertest for route-level tests:
 * @example
 * const { app, repo } = makeTestApp();
 * beforeEach(() => repo.reset());
 *
 * it('GET /api/users/:id → 200', async () => {
 *   repo.seed(adminUser);
 *   const res = await request(app).get('/api/users/usr_admin_001').expect(200);
 *   expect(res.body.email).toBe('admin@example.com');
 * });
 *
 * Use with http.createServer for UserClient tests that need a real URL:
 * @example
 * let server: http.Server;
 * let client: UserClient;
 * beforeAll(done => {
 *   const { app } = makeTestApp([adminUser]);
 *   server = http.createServer(app);
 *   server.listen(0, () => {
 *     const { port } = server.address() as AddressInfo;
 *     client = createUserClient(`http://localhost:${port}`);
 *     done();
 *   });
 * });
 * afterAll(done => server.close(done));
 */
export function makeTestApp(seed?: User[]): TestAppResult {
  const { repo, service } = makeTestService(seed);

  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes(service));
  app.use(errorHandler);

  return { app, repo, service };
}

// ─── Commander Program Factory ─────────────────────────────────────────────

export interface TestProgramResult {
  /** Commander program with user subcommands registered. */
  program: Command;
  /** In-memory repository — call reset() in beforeEach. */
  repo: MockUserRepository;
  /** The UserService instance powering the commands. */
  service: UserService;
}

/**
 * Create a fully wired Commander program for CLI integration testing.
 * Registers user subcommands (user get, user create, user list).
 *
 * Drive commands via program.parseAsync(['', '', ...args]).
 * Mock process.stdout/stderr/exit before calling to capture output.
 *
 * @example
 * const { program, repo } = makeTestProgram();
 * beforeEach(() => repo.reset());
 *
 * it('user get outputs JSON', async () => {
 *   repo.seed(adminUser);
 *   const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(...);
 *   await program.parseAsync(['', '', 'user', 'get', 'usr_admin_001']);
 *   const dto = JSON.parse(out.stdout.join(''));
 *   expect(dto.email).toBe('admin@example.com');
 * });
 */
export function makeTestProgram(seed?: User[]): TestProgramResult {
  const { repo, service } = makeTestService(seed);

  const program = new Command()
    .name('test-app')
    .exitOverride(); // prevents process.exit in test context

  registerUserCommands(program, service);

  return { program, repo, service };
}

// ─── CLI Test Helpers ──────────────────────────────────────────────────────

/**
 * Captures stdout, stderr, and exit code during a CLI test.
 * Wire this up in beforeEach and call restore() in afterEach.
 *
 * @example
 * let capture: CliCapture;
 * beforeEach(() => { capture = createCliCapture(); });
 * afterEach(() => capture.restore());
 *
 * it('outputs JSON', async () => {
 *   await capture.run(program, 'user', 'get', 'usr_admin_001');
 *   expect(JSON.parse(capture.stdout)).toMatchObject({ email: 'admin@example.com' });
 * });
 */
export interface CliCapture {
  /** All stdout chunks joined as a single string. */
  readonly stdout: string;
  /** All stderr chunks joined as a single string. */
  readonly stderr: string;
  /** Last exit code passed to process.exit, or null if not called. */
  readonly exitCode: number | null;
  /**
   * Run CLI args on a Commander program, capturing all output.
   * Catches the test-exit error thrown by the mocked process.exit.
   */
  run(program: Command, ...args: string[]): Promise<void>;
  /** Restore all spies. Call in afterEach. */
  restore(): void;
}

export function createCliCapture(): CliCapture {
  const chunks = { stdout: [] as string[], stderr: [] as string[], exitCode: null as number | null };

  const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    chunks.stdout.push(String(chunk));
    return true;
  });
  const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    chunks.stderr.push(String(chunk));
    return true;
  });
  const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
    chunks.exitCode = (code as number) ?? 0;
    throw Object.assign(new Error(`process.exit(${code})`), { isTestExit: true });
  });

  return {
    get stdout()   { return chunks.stdout.join(''); },
    get stderr()   { return chunks.stderr.join(''); },
    get exitCode() { return chunks.exitCode; },

    async run(program: Command, ...args: string[]): Promise<void> {
      try {
        await program.parseAsync(['', '', ...args]);
      } catch (e) {
        if (!(e as { isTestExit?: boolean }).isTestExit) throw e;
      }
    },

    restore(): void {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      exitSpy.mockRestore();
    },
  };
}
