// examples/mcp/server.ts
// Pattern: Adapter MCP (core-sdk.adapter-mcp.md)
//
// MCP server wiring the shared core library into MCP tools.
//
// What this file does:
//   1. Loads and validates config (fails fast with clear error if invalid)
//   2. Wires dependencies: config → UserService → registerUserTools → server
//   3. Initializes services before accepting connections
//   4. Connects via StdioServerTransport
//   5. Shuts down gracefully on SIGTERM / SIGINT
//
// To adapt to your domain:
//   - Replace UserService + UserRepository with your own service
//   - Replace registerUserTools with your own tool registration function
//   - Implement UserRepository against your actual database

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '../../src/config';
import { UserService, UserRepository } from '../../src/services';
import { toUserId, toEmailAddress, toTimestamp, User } from '../../src/types';
import { registerUserTools } from './user.tools';

// ─── In-memory repository (replace with real database adapter) ───────────────
//
// This stub lets the example run without a database.
// In production, implement UserRepository using your actual DB client
// (Postgres, Firestore, DynamoDB, etc.) and inject it here.

class InMemoryUserRepository implements UserRepository {
  private store = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.email === email) return user;
    }
    return null;
  }

  async findAll(opts: { role?: string; cursor?: string; limit: number }) {
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

// ─── Bootstrap ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Load and validate config — throws ZodError immediately if invalid
  const config = loadConfig();

  // 2. Create a simple structured logger (stderr so it doesn't corrupt MCP stdio)
  const logger = {
    debug: (msg: string, ctx?: object) => process.stderr.write(JSON.stringify({ level: 'debug', msg, ...ctx }) + '\n'),
    info:  (msg: string, ctx?: object) => process.stderr.write(JSON.stringify({ level: 'info',  msg, ...ctx }) + '\n'),
    warn:  (msg: string, ctx?: object) => process.stderr.write(JSON.stringify({ level: 'warn',  msg, ...ctx }) + '\n'),
    error: (msg: string, ctx?: object) => process.stderr.write(JSON.stringify({ level: 'error', msg, ...ctx }) + '\n'),
  };

  // 3. Wire dependencies
  const repo    = new InMemoryUserRepository();
  const service = new UserService(config, logger, repo);

  // 4. Initialize service (connect to DB, warm up caches, etc.)
  await service.initialize();
  logger.info('UserService initialized');

  // 5. Create MCP server
  const server = new McpServer({
    name: 'user-service',
    version: '1.0.0',
  });

  // 6. Register tools — all user operations become MCP tools
  registerUserTools(server, service);

  // 7. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutting down', { signal });
    await service.shutdown();
    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // 8. Connect to stdio transport and start serving
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('MCP server connected on stdio');
}

main().catch(err => {
  process.stderr.write(JSON.stringify({ level: 'error', msg: 'Failed to start MCP server', error: String(err) }) + '\n');
  process.exit(1);
});
