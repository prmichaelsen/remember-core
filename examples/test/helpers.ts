// examples/test/helpers.ts
// Shared test setup for MCP integration tests.
// Provides ToolCapture, run() helper, and shared fixture/mock wiring.
//
// Usage in MCP tests:
//   import { ToolCapture, makeMcpTestSetup } from './helpers.js';
//
// Usage in CLI tests:
//   import { createCliCapture } from './helpers.js';
//   (or import from src/testing/helpers.ts for the full version)

import { Command } from 'commander';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { MockUserRepository } from './user.repository.mock.js';
import { UserService }         from '../../src/services/user.service.js';
import { createTestConfig }    from '../../src/config/index.js';
import type { Logger }         from '../../src/services/base.service.js';
import type { ServiceConfig }  from '../../src/config/schema.js';
import type { User }           from '../../src/types/shared.types.js';
import { registerUserTools }   from '../mcp/user.tools.js';
import { registerUserCommands } from '../cli/user.commands.js';

// ─── Silent Logger ─────────────────────────────────────────────────────────

/** Logger that discards all output — safe for test environments. */
export const mockLogger: Logger = {
  debug: () => {},
  info:  () => {},
  warn:  () => {},
  error: () => {},
};

// ─── ToolCapture — MCP test shim ──────────────────────────────────────────

type ToolArgs    = Record<string, unknown>;
type ToolResult  = { content: Array<{ type: string; text: string }> };
type ToolHandler = (args: ToolArgs) => Promise<ToolResult>;

/**
 * Test shim that intercepts `server.tool()` registrations.
 * Cast to `McpServer` when passing to `registerUserTools`:
 *
 * @example
 * const capture = new ToolCapture();
 * registerUserTools(capture as unknown as McpServer, service);
 * const result = await capture.call('get_user', { id: 'usr_abc' });
 * const dto = JSON.parse(result.content[0].text);
 */
export class ToolCapture {
  private handlers = new Map<string, ToolHandler>();

  /**
   * Called by registerUserTools for each tool.
   * Stores the handler — does not start a real MCP server.
   */
  tool(
    name: string,
    _description: string,
    _inputSchema: unknown,
    handler: ToolHandler
  ): void {
    this.handlers.set(name, handler);
  }

  /**
   * Invoke a registered tool handler directly with the given args.
   * Throws McpError if the handler throws, or Error if tool not registered.
   */
  async call(name: string, args: ToolArgs): Promise<ToolResult> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`No tool registered: "${name}". Registered: [${[...this.handlers.keys()].join(', ')}]`);
    }
    return handler(args);
  }

  /** Names of all registered tools (use to assert registration count). */
  registeredTools(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// ─── MCP Test Setup Factory ────────────────────────────────────────────────

export interface McpTestSetup {
  capture: ToolCapture;
  repo:    MockUserRepository;
  service: UserService;
}

/**
 * Create a ToolCapture with all user tools registered.
 * Reset repo in beforeEach to isolate test state.
 *
 * @example
 * let setup: McpTestSetup;
 * beforeEach(() => {
 *   setup = makeMcpTestSetup();
 * });
 *
 * it('get_user returns UserDTO', async () => {
 *   setup.repo.seed(adminUser);
 *   const result = await setup.capture.call('get_user', { id: 'usr_admin_001' });
 *   const dto = JSON.parse(result.content[0].text);
 *   expect(dto.email).toBe('admin@example.com');
 * });
 */
export function makeMcpTestSetup(seed?: User[]): McpTestSetup {
  const repo    = new MockUserRepository();
  const config  = createTestConfig();
  const serviceConfig: ServiceConfig = { database: config.database, logging: config.logging };
  const service = new UserService(serviceConfig, mockLogger, repo);

  if (seed) {
    seed.forEach(u => repo.seed(u));
  }

  const capture = new ToolCapture();
  registerUserTools(capture as unknown as McpServer, service);

  return { capture, repo, service };
}

// ─── CLI Capture ──────────────────────────────────────────────────────────

export interface CliCapture {
  readonly stdout:   string;
  readonly stderr:   string;
  readonly exitCode: number | null;
  run(program: Command, ...args: string[]): Promise<void>;
  restore(): void;
}

/**
 * Capture stdout, stderr, and process.exit calls during CLI tests.
 * Wire in beforeEach / afterEach:
 *
 * @example
 * let capture: CliCapture;
 * beforeEach(() => { capture = createCliCapture(); });
 * afterEach(() => capture.restore());
 *
 * it('outputs user JSON', async () => {
 *   const { program, repo } = makeCliTestSetup([adminUser]);
 *   await capture.run(program, 'user', 'get', 'usr_admin_001');
 *   expect(JSON.parse(capture.stdout).email).toBe('admin@example.com');
 *   expect(capture.exitCode).toBeNull();
 * });
 */
export function createCliCapture(): CliCapture {
  const chunks = {
    stdout:   [] as string[],
    stderr:   [] as string[],
    exitCode: null as number | null,
  };

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

// ─── CLI Test Setup Factory ────────────────────────────────────────────────

export interface CliTestSetup {
  program: Command;
  repo:    MockUserRepository;
  service: UserService;
}

/**
 * Create a Commander program with user commands registered.
 * Use with createCliCapture() for full CLI integration tests.
 *
 * @example
 * it('user list returns paginated results', async () => {
 *   const { program, repo } = makeCliTestSetup(allUsers);
 *   await capture.run(program, 'user', 'list', '--json');
 *   const page = JSON.parse(capture.stdout);
 *   expect(page.items).toHaveLength(3);
 * });
 */
export function makeCliTestSetup(seed?: User[]): CliTestSetup {
  const repo    = new MockUserRepository();
  const config  = createTestConfig();
  const serviceConfig: ServiceConfig = { database: config.database, logging: config.logging };
  const service = new UserService(serviceConfig, mockLogger, repo);

  if (seed) {
    seed.forEach(u => repo.seed(u));
  }

  const program = new Command()
    .name('test-app')
    .exitOverride();

  registerUserCommands(program, service);

  return { program, repo, service };
}

// ─── Re-exports for convenience ────────────────────────────────────────────

export { MockUserRepository } from './user.repository.mock.js';
export { ErrorCode, McpError };
