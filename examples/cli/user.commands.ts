// examples/cli/user.commands.ts
// Pattern: Adapter CLI (core-sdk.adapter-cli.md)
//
// Registers Commander commands that expose UserService methods as CLI verbs.
// Each command handler:
//   1. Calls UserService — all business logic lives there
//   2. Branches on Result<T,E>:
//      - Ok  → prints JSON (or table) to stdout, exits 0
//      - Err → prints kind + message to stderr, exits 1
//
// Business logic belongs in UserService, not here.
// Success output goes to stdout; errors go to stderr — shell-composable.

import { Command } from 'commander';
import { UserService } from '../../src/services';
import { isOk, toUserDTO } from '../../src/types';

// ─── Output helpers ───────────────────────────────────────────────────────────

function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function printTable(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    process.stdout.write('(no results)\n');
    return;
  }
  const cols = Object.keys(rows[0]);
  const widths = cols.map(c =>
    Math.max(c.length, ...rows.map(r => String(r[c] ?? '').length))
  );
  const divider = widths.map(w => '-'.repeat(w + 2)).join('+');
  const header  = cols.map((c, i) => ` ${c.padEnd(widths[i])} `).join('|');

  process.stdout.write(header + '\n');
  process.stdout.write(divider + '\n');
  for (const row of rows) {
    const line = cols.map((c, i) => ` ${String(row[c] ?? '').padEnd(widths[i])} `).join('|');
    process.stdout.write(line + '\n');
  }
}

function printError(kind: string, message: string): void {
  process.stderr.write(`Error [${kind}]: ${message}\n`);
}

// ─── Command registration ─────────────────────────────────────────────────────

/**
 * Register all user commands on a Commander program.
 * Call this before `program.parseAsync(process.argv)`.
 */
export function registerUserCommands(program: Command, service: UserService): void {
  const user = program
    .command('user')
    .description('Manage users');

  // ── user get <id> ──────────────────────────────────────────────────────────
  user
    .command('get <id>')
    .description('Get a user by ID')
    .option('--json', 'Output as JSON (default)')
    .action(async (id: string) => {
      const parsed = service.parseUserId(id);
      if (!isOk(parsed)) {
        printError(parsed.error.kind, parsed.error.message);
        process.exit(1);
      }

      const result = await service.findUser(parsed.value);
      if (isOk(result)) {
        printJson(toUserDTO(result.value));
      } else {
        printError(result.error.kind, result.error.message);
        process.exit(1);
      }
    });

  // ── user create <email> <name> ─────────────────────────────────────────────
  user
    .command('create <email> <name>')
    .description('Create a new user')
    .option('--role <role>', 'User role: admin, member, or viewer (default: member)')
    .option('--json', 'Output as JSON (default)')
    .action(async (email: string, name: string, opts: { role?: string }) => {
      const result = await service.createUser({
        email,
        name,
        role: opts.role as 'admin' | 'member' | 'viewer' | undefined,
      });
      if (isOk(result)) {
        printJson(toUserDTO(result.value));
      } else {
        printError(result.error.kind, result.error.message);
        process.exit(1);
      }
    });

  // ── user list ──────────────────────────────────────────────────────────────
  user
    .command('list')
    .description('List users with optional filtering and pagination')
    .option('--role <role>',     'Filter by role: admin, member, or viewer')
    .option('--cursor <cursor>', 'Pagination cursor from a previous list response')
    .option('--limit <n>',       'Maximum number of results (default: 20)', '20')
    .option('--json',            'Output as JSON instead of a table')
    .action(async (opts: { role?: string; cursor?: string; limit?: string; json?: boolean }) => {
      const result = await service.listUsers({
        role:   opts.role as 'admin' | 'member' | 'viewer' | undefined,
        cursor: opts.cursor,
        limit:  opts.limit ? parseInt(opts.limit, 10) : undefined,
      });

      const items = result.items.map(toUserDTO);

      if (opts.json) {
        printJson({ ...result, items });
      } else {
        printTable(items as Record<string, unknown>[]);
        process.stdout.write(`\nTotal: ${result.total}  hasMore: ${result.hasMore}`);
        if (result.cursor) {
          process.stdout.write(`  next: --cursor ${result.cursor}`);
        }
        process.stdout.write('\n');
      }
    });
}
