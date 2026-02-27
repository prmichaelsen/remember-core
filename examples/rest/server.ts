// examples/rest/server.ts
// Pattern: Adapter REST (core-sdk.adapter-rest.md)
//
// Express REST server wiring the shared core library into HTTP.
//
// What this file does:
//   1. Loads and validates config (fails fast with clear error if invalid)
//   2. Wires dependencies: config → UserService → routes → app
//   3. Registers middleware and routes
//   4. Initializes services before accepting traffic
//   5. Shuts down gracefully on SIGTERM
//
// To adapt to your domain:
//   - Replace UserService + UserRepository with your own service
//   - Replace userRoutes with your own route factory
//   - Implement UserRepository against your actual database

import express from 'express';
import { loadConfig } from '../../src/config';
import { UserService, UserRepository } from '../../src/services';
import { toUserId, toEmailAddress, toTimestamp, User } from '../../src/types';
import { userRoutes } from './user.routes';
import { errorHandler } from './error-handler';

// ─── In-memory repository (replace with real database adapter) ──────────────
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

  // 2. Create a simple structured logger (replace with winston/pino in production)
  const logger = {
    debug: (msg: string, ctx?: object) => console.debug(JSON.stringify({ level: 'debug', msg, ...ctx })),
    info:  (msg: string, ctx?: object) => console.info(JSON.stringify({ level: 'info',  msg, ...ctx })),
    warn:  (msg: string, ctx?: object) => console.warn(JSON.stringify({ level: 'warn',  msg, ...ctx })),
    error: (msg: string, ctx?: object) => console.error(JSON.stringify({ level: 'error', msg, ...ctx })),
  };

  // 3. Wire dependencies
  const repo    = new InMemoryUserRepository();
  const service = new UserService(config, logger, repo);

  // 4. Initialize service (connect to DB, warm up caches, etc.)
  await service.initialize();
  logger.info('UserService initialized');

  // 5. Build Express app
  const app = express();
  app.use(express.json());

  // Health check — useful for load balancers and container orchestrators
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Mount user routes
  app.use('/api/users', userRoutes(service));

  // Centralized error handler — MUST be registered after all routes
  app.use(errorHandler);

  // 6. Start listening
  const { port, host } = config.server;
  const server = app.listen(port, host, () => {
    logger.info('Server started', { port, host });
  });

  // 7. Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    logger.info('Shutting down', { signal });
    server.close(async () => {
      await service.shutdown();
      logger.info('Server stopped');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

main().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
