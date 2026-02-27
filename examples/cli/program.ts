// examples/cli/program.ts
// Pattern: Adapter CLI (core-sdk.adapter-cli.md)
//
// Commander CLI wiring the shared core library into CLI commands.
//
// What this file does:
//   1. Creates Commander program with name, description, version
//   2. Loads and validates config (fails fast with clear error if invalid)
//   3. Wires dependencies: config → UserService → registerUserCommands → program
//   4. Parses process.argv and dispatches to the matching command handler
//
// To adapt to your domain:
//   - Replace UserService + UserRepository with your own service
//   - Replace registerUserCommands with your own command registration function
//   - Implement UserRepository against your actual database
//
// Usage:
//   ts-node examples/cli/program.ts user get usr_abc123
//   ts-node examples/cli/program.ts user create alice@example.com Alice --role admin
//   ts-node examples/cli/program.ts user list --limit 10 --json

import { Command } from 'commander';
import { loadConfig } from '../../src/config';
import { UserService, UserRepository } from '../../src/services';
import { toUserId, User } from '../../src/types';
import { registerUserCommands } from './user.commands';

// ─── In-memory repository (replace with real database adapter) ───────────────
//
// This stub lets the example run without a database.
// In production, implement UserRepository using your actual DB client.

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
  // 1. Load and validate config
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(`Config error: ${(err as Error).message}\n`);
    process.exit(2); // exit 2 = usage/config error
  }

  // 2. Simple logger (CLI: structured JSON to stderr so stdout stays clean)
  const logger = {
    debug: (msg: string, ctx?: object) => process.stderr.write(JSON.stringify({ level: 'debug', msg, ...ctx }) + '\n'),
    info:  (_msg: string, _ctx?: object) => { /* suppress in CLI */ },
    warn:  (msg: string, ctx?: object) => process.stderr.write(JSON.stringify({ level: 'warn',  msg, ...ctx }) + '\n'),
    error: (msg: string, ctx?: object) => process.stderr.write(JSON.stringify({ level: 'error', msg, ...ctx }) + '\n'),
  };

  // 3. Wire dependencies
  const repo    = new InMemoryUserRepository();
  const service = new UserService(config, logger, repo);
  await service.initialize();

  // 4. Build Commander program
  const program = new Command();
  program
    .name('my-app')
    .description('CLI for the core-sdk example service')
    .version('1.0.0');

  // 5. Register all user commands
  registerUserCommands(program, service);

  // 6. Configure error handling:
  //    - Usage errors (unknown command, missing arg) → exit 2
  //    - Commander prints its own error message; we just set the exit code
  program.exitOverride(); // throws CommanderError instead of calling process.exit

  try {
    await program.parseAsync(process.argv);
  } catch (err: unknown) {
    // CommanderError has exitCode property
    const exitCode = (err as { exitCode?: number }).exitCode;
    if (exitCode !== undefined && exitCode !== 0) {
      // Commander already printed the message
      process.exit(exitCode === 1 ? 2 : exitCode); // map to exit 2 for usage errors
    }
    // Re-throw unexpected errors
    throw err;
  }

  await service.shutdown();
}

main().catch(err => {
  process.stderr.write(`Unexpected error: ${(err as Error).message}\n`);
  process.exit(1);
});
