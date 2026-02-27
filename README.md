# Core SDK — Template Files

This directory contains pre-filled TypeScript source files that implement the core-sdk patterns. Install these into your project to start with a working foundation instead of building from scratch.

## Directory Structure

```
agent/files/
├── config/                          # Project configuration files
│   ├── package.json.template        # npm package with subpath exports
│   ├── tsconfig.json                # TypeScript: ESM, strict, declarations
│   ├── jest.config.js               # Jest: ESM + TypeScript + colocated tests
│   ├── esbuild.build.js             # esbuild: multiple entry points
│   ├── esbuild.watch.js             # esbuild: watch mode for development
│   ├── gitignore.template           # Git ignore rules
│   └── npmignore.template           # npm ignore rules
│
├── src/                             # Installable source files (copy to ./src/)
│   ├── types/
│   │   ├── result.types.ts          # Result<T,E>, ok, err, combinators
│   │   ├── utils.types.ts           # DeepPartial, Nullable, Maybe, Immutable
│   │   ├── shared.types.ts          # Branded types, User entity, DTOs, pagination
│   │   └── index.ts                 # Barrel re-export
│   │
│   ├── errors/
│   │   ├── base.error.ts            # AppError abstract base class
│   │   ├── app-errors.ts            # Typed error subclasses (8 kinds)
│   │   └── index.ts                 # Barrel re-export + AppErrorUnion + HTTP_STATUS
│   │
│   ├── config/
│   │   ├── schema.ts                # Zod schemas + inferred types + test helper
│   │   ├── loader.ts                # loadConfig (env var merging + validation)
│   │   └── index.ts                 # Barrel re-export
│   │
│   ├── services/
│   │   ├── base.service.ts          # BaseService abstract class with lifecycle
│   │   ├── user.service.ts          # UserService: Result<T,E> + validation example
│   │   └── index.ts                 # Barrel re-export
│   │
│   └── client/
│       ├── user.client.ts           # createUserClient — typed REST client factory
│       └── index.ts                 # createClient aggregator + barrel re-export
│
└── examples/                        # Reference implementations (copy to ./examples/)
    ├── rest/
    │   ├── server.ts                # Express REST server bootstrap
    │   ├── user.routes.ts           # Route handlers using Result<T,E>
    │   ├── error-handler.ts         # Centralized error → HTTP status mapping
    │   └── client-usage.ts          # Runnable demo using createClient()
    │
    ├── mcp/
    │   ├── server.ts                # McpServer + StdioServerTransport bootstrap
    │   └── user.tools.ts            # registerUserTools — get_user, create_user, list_users
    │
    ├── cli/
    │   ├── program.ts               # Commander program bootstrap
    │   └── user.commands.ts         # registerUserCommands — user get/create/list
    │
    └── test/
        ├── user.repository.mock.ts  # MockUserRepository (reset/seed/all)
        ├── rest.integration.spec.ts # REST + UserClient integration tests
        ├── mcp.integration.spec.ts  # MCP tool integration tests
        └── cli.integration.spec.ts  # CLI command integration tests
```

## What Each File Provides

### Configuration Files (`config/`)

| File | Purpose |
|------|---------|
| `package.json.template` | npm package with 6 subpath exports for tree-shaking |
| `tsconfig.json` | TypeScript strict mode, ESM, declaration generation |
| `jest.config.js` | Jest with `ts-jest`, `extensionsToTreatAsEsm`, colocated `.spec.ts` files |
| `esbuild.build.js` | Bundle multiple entry points to `dist/` |
| `esbuild.watch.js` | Watch mode for development |
| `gitignore.template` | Node.js `.gitignore` rules |
| `npmignore.template` | Exclude `src/`, `agent/`, tests from published package |

### Type System (`src/types/`)

- **`result.types.ts`** — `Result<T, E>` discriminated union with `ok()`, `err()`, `isOk()`, `isErr()`, and combinators (`mapOk`, `mapErr`, `andThen`, `getOrElse`, `tryCatch`, `tryCatchAsync`). Use for operations where failure is expected.

- **`utils.types.ts`** — Generic type utilities: `DeepPartial<T>` for test fixtures, `Nullable<T>` / `Maybe<T>` for optional fields, `Immutable<T>` for config objects, `RequireFields<T, K>` for endpoint-specific inputs.

- **`shared.types.ts`** — Branded primitive types (`UserId`, `EmailAddress`, `Timestamp`) that prevent mixing semantically different strings at compile time. Also includes the `User` entity, `UserDTO` (API response shape), `PaginatedResult<T>`, and their factory/transformer functions.

### Error Hierarchy (`src/errors/`)

- **`base.error.ts`** — `AppError` abstract base class with `kind` discriminant, `context` bag, and `toJSON()`. All application errors extend this.

- **`app-errors.ts`** — Eight typed error classes: `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ConflictError`, `RateLimitError`, `ExternalError`, `InternalError`. Each has typed constructor parameters and a `kind` literal.

- **`index.ts`** — Barrel re-export plus `AppErrorUnion` (the discriminated union type), `HTTP_STATUS` (the kind → HTTP status code map), and `isAppError()` type guard.

### Configuration (`src/config/`)

- **`schema.ts`** — Zod schemas for `Database`, `Server`, `Logging`, and `App` config. Types are always derived via `z.infer<>` — never written manually. Includes layer-scoped slices (`ServiceConfig`, `AdapterConfig`) and a `createTestConfig()` helper for tests.

- **`loader.ts`** — `loadConfig()` merges environment variables (highest priority) on top of a raw config object, then validates through the Zod schema. Call once at startup.

### Service Layer (`src/services/`)

- **`base.service.ts`** — `BaseService<TConfig>` abstract class. Provides constructor injection of config + logger, `initialize()` and `shutdown()` lifecycle hooks, and `this.name` from the class name.

- **`user.service.ts`** — `UserService` example implementing `findUser()`, `createUser()`, `listUsers()`, and `parseUserId()`. Demonstrates `Result<T, E>` for expected failures, typed error subclasses, and the `UserRepository` interface (inject a real DB adapter or a mock in tests).

### REST Client (`src/client/`)

The client is the installable counterpart to the REST server example. Install it alongside `src/` so consumers call typed functions instead of writing their own HTTP client code.

- **`user.client.ts`** — `createUserClient(baseUrl, init?)` factory. Maps HTTP responses back to `Result<T, E>`:
  - `getUser(id)` → `Promise<Result<UserDTO, NotFoundError | ValidationError>>`
  - `createUser(input)` → `Promise<Result<UserDTO, ValidationError | ConflictError>>`
  - `listUsers(opts?)` → `Promise<PaginatedResult<UserDTO>>`

- **`index.ts`** — Top-level `createClient({ baseUrl, init? })` aggregator that returns `{ users: UserClient }`. Single initialization point; consumers destructure what they need:

  ```typescript
  const { users } = createClient({ baseUrl: 'https://api.example.com' });
  const result = await users.getUser('usr_abc123');
  if (isOk(result)) console.log(result.value.name);
  ```

## Examples

The `examples/` directory contains reference implementations showing how to wire `UserService` to each deployment target. Each example uses an in-memory `UserRepository` — replace it with your real database adapter.

### REST Server (`examples/rest/`)

Express REST server exposing UserService over HTTP.

**Files:**
- `server.ts` — Express app bootstrap: config → service → routes → errorHandler → listen
- `user.routes.ts` — `GET /api/users/:id`, `POST /api/users`, `GET /api/users`
- `error-handler.ts` — Maps `AppError` kinds to HTTP status codes via `HTTP_STATUS`
- `client-usage.ts` — Runnable demo using `createClient()` against the running server

**How to run:**

```bash
# Set required environment variables
export DB_NAME=mydb DB_USER=user DB_PASSWORD=secret

# Start the server
ts-node examples/rest/server.ts

# In another terminal — run the client demo
ts-node examples/rest/client-usage.ts
```

**Endpoints:**

| Method | Path | Success | Errors |
|--------|------|---------|--------|
| `GET` | `/api/users/:id` | 200 UserDTO | 400 validation, 404 not found |
| `POST` | `/api/users` | 201 UserDTO | 400 validation, 409 conflict |
| `GET` | `/api/users` | 200 PaginatedResult | — |
| `GET` | `/health` | 200 `{ status: "ok" }` | — |

### MCP Server (`examples/mcp/`)

MCP server exposing UserService as AI-callable tools via stdio transport.

**Files:**
- `server.ts` — `McpServer` + `StdioServerTransport` bootstrap; all logging to stderr
- `user.tools.ts` — `registerUserTools(server, service)` registering three tools

**How to run:**

```bash
# Start the MCP server (communicates via stdio)
ts-node examples/mcp/server.ts
```

**Tools:**

| Tool | Input | Returns |
|------|-------|---------|
| `get_user` | `{ id: string }` | UserDTO JSON or `McpError(InvalidParams)` |
| `create_user` | `{ email, name, role? }` | UserDTO JSON or `McpError` |
| `list_users` | `{ role?, cursor?, limit? }` | Paginated UserDTO array |

**Note:** MCP servers communicate via stdout — all logging goes to stderr to avoid corrupting the protocol.

**MCP config entry (for Claude Desktop):**

```json
{
  "mcpServers": {
    "user-service": {
      "command": "ts-node",
      "args": ["examples/mcp/server.ts"],
      "env": {
        "DB_NAME": "mydb",
        "DB_USER": "user",
        "DB_PASSWORD": "secret"
      }
    }
  }
}
```

### CLI Tool (`examples/cli/`)

Commander CLI exposing UserService as shell commands.

**Files:**
- `program.ts` — Commander bootstrap: config → service → `registerUserCommands` → `parseAsync`
- `user.commands.ts` — `registerUserCommands(program, service)` with three subcommands

**How to run:**

```bash
# Get a user by ID
ts-node examples/cli/program.ts user get usr_abc123

# Create a user
ts-node examples/cli/program.ts user create alice@example.com Alice --role admin

# List users with JSON output
ts-node examples/cli/program.ts user list --limit 10 --json

# Filter by role
ts-node examples/cli/program.ts user list --role member
```

**Exit codes:** `0` success, `1` application error (`AppError`), `2` usage/config error

**Output:** Success → stdout (JSON or table), errors → stderr — shell-composable.

## Integration Tests (`examples/test/`)

Integration tests validate that the adapters compose correctly with the shared core library. All tests use an in-memory repository — no real database, network, or file I/O required.

### Running the Tests

```bash
# Run all integration tests
npx jest --testPathPattern="examples/test"

# Or with the integration config (if jest.integration.config.js exists)
npx jest --config jest.integration.config.js
```

### Test Files

| File | What It Tests |
|------|--------------|
| `user.repository.mock.ts` | Shared `MockUserRepository` — `reset()`, `seed()`, `all()` |
| `rest.integration.spec.ts` | Express routes via supertest + `UserClient` HTTP round-trip |
| `mcp.integration.spec.ts` | MCP tool handlers via `ToolCapture` shim (no transport needed) |
| `cli.integration.spec.ts` | Commander handlers via `program.parseAsync` with stdout/stderr mocks |

### Test Strategy

- **REST tests** — `supertest` against a real Express app; `UserClient` tested against `http.createServer` on port 0
- **MCP tests** — `ToolCapture` class intercepts `server.tool()` registrations so handlers can be called directly
- **CLI tests** — `jest.spyOn(process.stdout/stderr/exit)` + `program.parseAsync(['', '', ...args])`

## Installation

### With ACP Package Install (coming soon)

```bash
@acp.package-install --repo https://github.com/prmichaelsen/acp-core-sdk.git
```

### Manual Installation

Copy configuration files:

```bash
cp agent/files/config/tsconfig.json ./
cp agent/files/config/jest.config.js ./
cp agent/files/config/esbuild.build.js ./
cp agent/files/config/esbuild.watch.js ./
cp agent/files/config/gitignore.template ./.gitignore
cp agent/files/config/npmignore.template ./.npmignore
```

Customize `package.json.template`:
- Replace `{{PACKAGE_NAME}}`, `{{PACKAGE_DESCRIPTION}}`, `{{AUTHOR_NAME}}`

Copy source files:

```bash
cp -r agent/files/src/* ./src/
```

Copy examples (optional):

```bash
cp -r agent/files/examples ./examples
```

Install dependencies:

```bash
# Core dependencies
npm install zod

# Dev dependencies
npm install --save-dev typescript jest ts-jest @types/jest esbuild

# REST server example
npm install express
npm install --save-dev @types/express supertest @types/supertest

# MCP server example
npm install @modelcontextprotocol/sdk

# CLI example
npm install commander
```

## Customization Guide

### Adapting to Your Domain

The `src/types/shared.types.ts` and `src/services/user.service.ts` files use a `User` domain as an example. To adapt to your domain:

1. **Rename types**: Replace `User`, `UserId`, `UserDTO`, `UserRepository` with your domain entity
2. **Update `CreateUserInput`**: Add the fields your entity needs
3. **Update `UserService`**: Add your business logic methods, keep the `Result<T, E>` pattern
4. **Implement `UserRepository`**: Write a concrete implementation for your database (Firestore, Postgres, etc.)

### Adding Error Kinds

To add new error types:

1. Add a `kind` to `ErrorKind` in `src/errors/base.error.ts`
2. Add a class to `src/errors/app-errors.ts`
3. Add it to `AppErrorUnion` and `HTTP_STATUS` in `src/errors/index.ts`
4. Re-export from `src/errors/index.ts`

## Related Patterns

See the pattern documentation in `agent/patterns/` for detailed rationale and usage guidelines:

- [Result Types](../patterns/core-sdk.types-result.md)
- [Error Types](../patterns/core-sdk.types-error.md)
- [Service Base](../patterns/core-sdk.service-base.md)
- [Config Schema](../patterns/core-sdk.config-schema.md)
- [Shared Types](../patterns/core-sdk.types-shared.md)
- [Generic Utility Types](../patterns/core-sdk.types-generic.md)
- [Adapter REST](../patterns/core-sdk.adapter-rest.md)
- [Adapter MCP](../patterns/core-sdk.adapter-mcp.md)
- [Adapter CLI](../patterns/core-sdk.adapter-cli.md)
- [Adapter Client](../patterns/core-sdk.adapter-client.md)
- [Integration Testing](../patterns/core-sdk.testing-integration.md)
