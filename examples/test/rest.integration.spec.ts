// examples/test/rest.integration.spec.ts
// Pattern: Integration Testing (core-sdk.testing-integration.md)
//
// Integration tests for the REST adapter (examples/rest/).
// Tests the full request/response flow through Express + UserService.
// Also verifies the UserClient (src/client/) maps HTTP responses back to Result<T,E>.
//
// Requires Node.js >= 18 for native fetch (used by UserClient).

import http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import express from 'express';
import { createTestConfig } from '../../src/config/schema';
import { UserService } from '../../src/services';
import { isOk, toUserId, toEmailAddress, toTimestamp, User } from '../../src/types';
import { userRoutes } from '../rest/user.routes';
import { errorHandler } from '../rest/error-handler';
import { createUserClient, UserClient } from '../../src/client';
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

function makeTestApp() {
  const config      = createTestConfig();
  const serviceConfig = { database: config.database, logging: config.logging };
  const logger      = makeLogger();
  const repo        = new MockUserRepository();
  const service     = new UserService(serviceConfig, logger, repo);

  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes(service));
  app.use(errorHandler);

  return { app, repo, service };
}

// ─── Fixture Factory ──────────────────────────────────────────────────────────

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

describe('REST API (integration)', () => {
  let app: express.Express;
  let repo: MockUserRepository;
  let service: UserService;

  beforeAll(async () => {
    ({ app, repo, service } = makeTestApp());
    await service.initialize();
  });

  afterAll(async () => {
    await service.shutdown();
  });

  beforeEach(() => {
    repo.reset();
  });

  // ── GET /api/users/:id ────────────────────────────────────────────────────

  describe('GET /api/users/:id', () => {
    it('returns 200 and UserDTO for a known user', async () => {
      const user = makeUser();
      repo.seed(user);

      const res = await request(app).get(`/api/users/${user.id}`).expect(200);

      expect(res.body).toMatchObject({
        id:    user.id,
        email: user.email,
        name:  user.name,
        role:  user.role,
      });
      // UserDTO omits updatedAt
      expect(res.body.updatedAt).toBeUndefined();
    });

    it('returns 404 for an unknown user ID', async () => {
      const res = await request(app).get('/api/users/usr_unknown99').expect(404);

      expect(res.body.error.kind).toBe('not_found');
      expect(res.body.error.message).toContain('not found');
    });

    it('returns 400 for an empty (whitespace) user ID', async () => {
      // URL-encoded space becomes a non-empty string that fails toUserId validation
      const res = await request(app).get('/api/users/%20').expect(400);

      expect(res.body.error.kind).toBe('validation');
    });
  });

  // ── POST /api/users ───────────────────────────────────────────────────────

  describe('POST /api/users', () => {
    it('creates a user and returns 201 with UserDTO', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ email: 'bob@example.com', name: 'Bob' })
        .expect(201);

      expect(res.body).toMatchObject({
        email: 'bob@example.com',
        name:  'Bob',
        role:  'member',
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
    });

    it('creates a user with an explicit role', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ email: 'admin@example.com', name: 'Admin User', role: 'admin' })
        .expect(201);

      expect(res.body.role).toBe('admin');
    });

    it('returns 400 when email is missing @', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ email: 'not-an-email', name: 'Bob' })
        .expect(400);

      expect(res.body.error.kind).toBe('validation');
      expect(res.body.error.fields?.email).toBeDefined();
    });

    it('returns 400 when name is too short', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ email: 'bob@example.com', name: 'B' })
        .expect(400);

      expect(res.body.error.kind).toBe('validation');
      expect(res.body.error.fields?.name).toBeDefined();
    });

    it('returns 409 when email is already taken', async () => {
      repo.seed(makeUser({ email: toEmailAddress('alice@example.com') }));

      const res = await request(app)
        .post('/api/users')
        .send({ email: 'alice@example.com', name: 'Alice Again' })
        .expect(409);

      expect(res.body.error.kind).toBe('conflict');
    });
  });

  // ── GET /api/users ────────────────────────────────────────────────────────

  describe('GET /api/users', () => {
    it('returns 200 with paginated list', async () => {
      repo.seed(makeUser({ id: toUserId('usr_a'), email: toEmailAddress('a@example.com') }));
      repo.seed(makeUser({ id: toUserId('usr_b'), email: toEmailAddress('b@example.com'), role: 'admin' }));

      const res = await request(app).get('/api/users').expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(typeof res.body.hasMore).toBe('boolean');
    });

    it('filters users by role', async () => {
      repo.seed(makeUser({ id: toUserId('usr_a'), email: toEmailAddress('a@example.com'), role: 'admin' }));
      repo.seed(makeUser({ id: toUserId('usr_m'), email: toEmailAddress('m@example.com'), role: 'member' }));

      const res = await request(app).get('/api/users?role=admin').expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].role).toBe('admin');
    });

    it('respects the limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        repo.seed(makeUser({
          id:    toUserId(`usr_limit${i}`),
          email: toEmailAddress(`limit${i}@example.com`),
        }));
      }

      const res = await request(app).get('/api/users?limit=3').expect(200);

      expect(res.body.items).toHaveLength(3);
      expect(res.body.total).toBe(5);
    });

    it('returns empty list when no users exist', async () => {
      const res = await request(app).get('/api/users').expect(200);

      expect(res.body.items).toHaveLength(0);
      expect(res.body.total).toBe(0);
      expect(res.body.hasMore).toBe(false);
    });
  });

  // ── Error handler ─────────────────────────────────────────────────────────

  describe('Error handler', () => {
    it('returns 500 for unexpected errors without leaking internals', async () => {
      const errApp = express();
      errApp.get('/boom', (_req, _res, next) => next(new Error('oops: secret details')));
      errApp.use(errorHandler);

      const res = await request(errApp).get('/boom').expect(500);

      expect(res.body.error.kind).toBe('internal');
      expect(res.body.error.message).toBe('Internal server error');
      // Stack trace must not appear in response
      expect(JSON.stringify(res.body)).not.toContain('oops: secret details');
    });
  });

  // ── Round-trip: POST → GET ─────────────────────────────────────────────────

  describe('Round-trip: POST /api/users → GET /api/users/:id', () => {
    it('creates a user and fetches it back with the same data', async () => {
      const createRes = await request(app)
        .post('/api/users')
        .send({ email: 'charlie@example.com', name: 'Charlie' })
        .expect(201);

      const { id } = createRes.body as { id: string };

      const getRes = await request(app).get(`/api/users/${id}`).expect(200);

      expect(getRes.body).toMatchObject({
        id,
        email: 'charlie@example.com',
        name:  'Charlie',
      });
    });
  });

  // ── UserClient integration ─────────────────────────────────────────────────
  //
  // Spins up a real HTTP server (port 0 = OS-assigned) so UserClient can use
  // native fetch. Verifies that the client correctly maps HTTP responses back
  // to typed Result<T,E> values.

  describe('UserClient (integration)', () => {
    let server: http.Server;
    let client: UserClient;

    beforeAll(done => {
      server = http.createServer(app);
      server.listen(0, () => {
        const { port } = server.address() as AddressInfo;
        client = createUserClient(`http://localhost:${port}`);
        done();
      });
    });

    afterAll(done => {
      server.close(done);
    });

    it('getUser returns Ok<UserDTO> for a known user', async () => {
      const user = makeUser({
        id:    toUserId('usr_client1'),
        email: toEmailAddress('client@example.com'),
        name:  'Client User',
      });
      repo.seed(user);

      const result = await client.getUser('usr_client1');

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.id).toBe('usr_client1');
        expect(result.value.email).toBe('client@example.com');
      }
    });

    it('getUser returns Err<NotFoundError> for an unknown user', async () => {
      const result = await client.getUser('usr_unknown99');

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.kind).toBe('not_found');
      }
    });

    it('createUser returns Ok<UserDTO> on success', async () => {
      const result = await client.createUser({
        email: 'newclient@example.com',
        name:  'New Client',
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.email).toBe('newclient@example.com');
        expect(result.value.id).toBeDefined();
      }
    });

    it('createUser returns Err<ConflictError> when email is already taken', async () => {
      // First creation succeeds
      await client.createUser({ email: 'dup@example.com', name: 'Dup' });

      // Second creation conflicts
      const second = await client.createUser({ email: 'dup@example.com', name: 'Dup Again' });

      expect(isOk(second)).toBe(false);
      if (!isOk(second)) {
        expect(second.error.kind).toBe('conflict');
      }
    });

    it('createUser returns Err<ValidationError> for invalid email', async () => {
      const result = await client.createUser({ email: 'not-valid', name: 'Bad' });

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.kind).toBe('validation');
      }
    });

    it('listUsers returns PaginatedResult<UserDTO>', async () => {
      repo.reset();
      repo.seed(makeUser({ id: toUserId('usr_l1'), email: toEmailAddress('l1@example.com') }));
      repo.seed(makeUser({ id: toUserId('usr_l2'), email: toEmailAddress('l2@example.com') }));

      const result = await client.listUsers();

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.items[0]).toMatchObject({ id: expect.any(String), email: expect.any(String) });
    });
  });
});
