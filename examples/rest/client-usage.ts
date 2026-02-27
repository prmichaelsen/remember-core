// examples/rest/client-usage.ts
// Pattern: Client Adapter (core-sdk.adapter-client.md)
//
// Runnable demo of the UserClient against the REST server from server.ts.
//
// How to run:
//   1. Start the REST server:  ts-node examples/rest/server.ts
//   2. In another terminal:    ts-node examples/rest/client-usage.ts
//
// What this demo does:
//   1. Creates a user (POST /api/users)
//   2. Fetches it back by ID (GET /api/users/:id)
//   3. Lists all users (GET /api/users)
//   4. Attempts to fetch an unknown ID — shows the Err branch

import { createClient } from '../../src/client';
import { isOk, isErr } from '../../src/types';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';
const { users } = createClient({ baseUrl: BASE_URL });

async function main(): Promise<void> {
  console.log(`Connecting to ${BASE_URL}\n`);

  // ── Create a user ──────────────────────────────────────────────────────────
  console.log('POST /api/users — create user...');
  const created = await users.createUser({
    email: 'alice@example.com',
    name: 'Alice',
    role: 'admin',
  });

  if (isErr(created)) {
    console.error('  Failed to create user:', created.error.kind, created.error.message);
    process.exit(1);
  }

  const user = created.value;
  console.log('  Created:', user);

  // ── Fetch by ID ────────────────────────────────────────────────────────────
  console.log(`\nGET /api/users/${user.id} — fetch by ID...`);
  const fetched = await users.getUser(user.id);

  if (isOk(fetched)) {
    console.log('  Fetched:', fetched.value);
  } else {
    console.error('  Error:', fetched.error.kind, fetched.error.message);
  }

  // ── List all users ─────────────────────────────────────────────────────────
  console.log('\nGET /api/users — list users...');
  const list = await users.listUsers({ limit: 10 });
  console.log(`  Total: ${list.total}, hasMore: ${list.hasMore}`);
  list.items.forEach(u => console.log(`  - ${u.id}  ${u.email}  (${u.role})`));

  // ── Unknown ID (Err branch) ────────────────────────────────────────────────
  console.log('\nGET /api/users/usr_unknown — expect not_found...');
  const missing = await users.getUser('usr_unknown');

  if (isErr(missing)) {
    console.log(`  Got expected error: kind=${missing.error.kind}`);
  } else {
    console.log('  Unexpectedly found user:', missing.value);
  }

  // ── Duplicate email (ConflictError branch) ─────────────────────────────────
  console.log('\nPOST /api/users — duplicate email, expect conflict...');
  const duplicate = await users.createUser({
    email: 'alice@example.com',
    name: 'Alice Again',
  });

  if (isErr(duplicate)) {
    console.log(`  Got expected error: kind=${duplicate.error.kind}`);
  } else {
    console.log('  Unexpectedly created user:', duplicate.value);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
