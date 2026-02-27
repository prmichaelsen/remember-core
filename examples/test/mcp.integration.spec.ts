// examples/test/mcp.integration.spec.ts
// Pattern: Integration Testing (core-sdk.testing-integration.md)
//
// Integration tests for the MCP adapter (examples/mcp/).
// Tests each tool handler directly — no MCP transport required.
//
// Strategy: ToolCapture intercepts server.tool() registrations, capturing the
// async handler functions. Tests call handlers directly with typed inputs,
// verifying Ok responses and McpError throws.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { createTestConfig } from '../../src/config/schema';
import { UserService } from '../../src/services';
import { toUserId, toEmailAddress, toTimestamp, User } from '../../src/types';
import { registerUserTools } from '../mcp/user.tools';
import { MockUserRepository } from './user.repository.mock';

// ─── Tool Capture ─────────────────────────────────────────────────────────────
//
// Minimal McpServer shim that captures registered tool handlers so tests can
// call them directly without a real MCP transport.

type ToolArgs   = Record<string, unknown>;
type ToolResult = { content: Array<{ type: string; text: string }> };
type ToolHandler = (args: ToolArgs) => Promise<ToolResult>;

class ToolCapture {
  private handlers = new Map<string, ToolHandler>();

  // Matches the overload used by registerUserTools: tool(name, desc, shape, handler)
  tool(_name: string, _desc: string, _shape: unknown, handler: ToolHandler): void;
  tool(name: string, _desc: string, _shape: unknown, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async call(name: string, args: ToolArgs): Promise<ToolResult> {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`No tool registered: ${name}`);
    return handler(args);
  }

  registeredTools(): string[] {
    return Array.from(this.handlers.keys());
  }
}

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

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('MCP tools (integration)', () => {
  let capture: ToolCapture;
  let repo: MockUserRepository;
  let service: UserService;

  beforeAll(async () => {
    const config = createTestConfig();
    const serviceConfig = { database: config.database, logging: config.logging };
    repo    = new MockUserRepository();
    service = new UserService(serviceConfig, makeLogger(), repo);
    await service.initialize();

    capture = new ToolCapture();
    // Cast to McpServer — ToolCapture satisfies the subset of McpServer used
    registerUserTools(capture as unknown as McpServer, service);
  });

  afterAll(async () => {
    await service.shutdown();
  });

  beforeEach(() => {
    repo.reset();
  });

  // ── Tool registration ─────────────────────────────────────────────────────

  it('registers exactly 3 tools: get_user, create_user, list_users', () => {
    expect(capture.registeredTools().sort()).toEqual(
      ['create_user', 'get_user', 'list_users']
    );
  });

  // ── get_user ──────────────────────────────────────────────────────────────

  describe('get_user', () => {
    it('returns UserDTO JSON for a known user', async () => {
      const user = makeUser();
      repo.seed(user);

      const result = await capture.call('get_user', { id: user.id });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const dto = JSON.parse(result.content[0].text);
      expect(dto.id).toBe(user.id);
      expect(dto.email).toBe(user.email);
      expect(dto.name).toBe(user.name);
    });

    it('throws McpError(InvalidParams) for an unknown user', async () => {
      await expect(
        capture.call('get_user', { id: 'usr_doesnotexist' })
      ).rejects.toThrow(McpError);

      try {
        await capture.call('get_user', { id: 'usr_doesnotexist' });
      } catch (e) {
        expect((e as McpError).code).toBe(ErrorCode.InvalidParams);
        expect((e as McpError).message).toContain('not found');
      }
    });

    it('throws McpError(InvalidParams) for an empty ID', async () => {
      // Empty string fails toUserId validation → ValidationError → InvalidParams
      await expect(
        capture.call('get_user', { id: '' })
      ).rejects.toThrow(McpError);

      try {
        await capture.call('get_user', { id: '' });
      } catch (e) {
        expect((e as McpError).code).toBe(ErrorCode.InvalidParams);
      }
    });
  });

  // ── create_user ───────────────────────────────────────────────────────────

  describe('create_user', () => {
    it('creates a user and returns UserDTO JSON', async () => {
      const result = await capture.call('create_user', {
        email: 'bob@example.com',
        name:  'Bob',
      });

      expect(result.content).toHaveLength(1);

      const dto = JSON.parse(result.content[0].text);
      expect(dto.email).toBe('bob@example.com');
      expect(dto.name).toBe('Bob');
      expect(dto.role).toBe('member');
      expect(dto.id).toBeDefined();
    });

    it('creates a user with an explicit role', async () => {
      const result = await capture.call('create_user', {
        email: 'admin@example.com',
        name:  'Admin User',
        role:  'admin',
      });

      const dto = JSON.parse(result.content[0].text);
      expect(dto.role).toBe('admin');
    });

    it('throws McpError(InvalidParams) for invalid email', async () => {
      await expect(
        capture.call('create_user', { email: 'not-an-email', name: 'Bad' })
      ).rejects.toThrow(McpError);

      try {
        await capture.call('create_user', { email: 'not-an-email', name: 'Bad' });
      } catch (e) {
        expect((e as McpError).code).toBe(ErrorCode.InvalidParams);
      }
    });

    it('throws McpError(InvalidRequest) for a duplicate email', async () => {
      repo.seed(makeUser({ email: toEmailAddress('alice@example.com') }));

      await expect(
        capture.call('create_user', { email: 'alice@example.com', name: 'Alice Duplicate' })
      ).rejects.toThrow(McpError);

      try {
        await capture.call('create_user', { email: 'alice@example.com', name: 'Alice Duplicate' });
      } catch (e) {
        // ConflictError maps to InvalidRequest
        expect((e as McpError).code).toBe(ErrorCode.InvalidRequest);
      }
    });
  });

  // ── list_users ────────────────────────────────────────────────────────────

  describe('list_users', () => {
    it('returns paginated UserDTO list', async () => {
      repo.seed(makeUser({ id: toUserId('usr_a'), email: toEmailAddress('a@example.com') }));
      repo.seed(makeUser({ id: toUserId('usr_b'), email: toEmailAddress('b@example.com') }));

      const result = await capture.call('list_users', {});

      const data = JSON.parse(result.content[0].text) as {
        items: unknown[];
        total: number;
        hasMore: boolean;
      };

      expect(data.items).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.hasMore).toBe(false);
    });

    it('filters by role', async () => {
      repo.seed(makeUser({ id: toUserId('usr_a'), email: toEmailAddress('a@example.com'), role: 'admin' }));
      repo.seed(makeUser({ id: toUserId('usr_m'), email: toEmailAddress('m@example.com'), role: 'member' }));

      const result = await capture.call('list_users', { role: 'admin' });

      const data = JSON.parse(result.content[0].text);
      expect(data.items).toHaveLength(1);
      expect(data.items[0].role).toBe('admin');
    });

    it('returns empty list when no users exist', async () => {
      const result = await capture.call('list_users', {});

      const data = JSON.parse(result.content[0].text);
      expect(data.items).toHaveLength(0);
      expect(data.total).toBe(0);
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        repo.seed(makeUser({
          id:    toUserId(`usr_lim${i}`),
          email: toEmailAddress(`lim${i}@example.com`),
        }));
      }

      const result = await capture.call('list_users', { limit: 2 });

      const data = JSON.parse(result.content[0].text);
      expect(data.items).toHaveLength(2);
      expect(data.total).toBe(5);
      expect(data.hasMore).toBe(true);
    });
  });
});
