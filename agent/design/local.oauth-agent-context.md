# OAuth Agent Context — Server-Side Auto-Injection

**Concept**: Auto-inject `internal_type: 'agent'` for all OAuth MCP connections so agent internal memory tools work without client-side header configuration
**Created**: 2026-03-20
**Status**: Design Specification

---

## Overview

When Claude CLI connects to remember-mcp via the OAuth service (remember-mcp-oauth-service), internal memory tools (`remember_create_internal_memory`, etc.) fail because no `InternalContext` is passed to the server factory. The OAuth service currently calls `createRememberServer(token, userId)` without the third `options` parameter.

Rather than relying on clients to send custom headers (which Claude Code has persistent bugs with), the server should auto-inject agent context. The OAuth server is the authority on what kind of session is being established — all OAuth clients are AI agents (Claude CLI), so the server can declare this definitively.

---

## Problem Statement

- **What**: `remember_*_internal_memory` tools fail with `"Internal context required. X-Internal-Type header must be set."` when accessed through the OAuth MCP service
- **Why it matters**: Agent internal memory is a core feature — agents can't persist observations, preferences, or session notes without it
- **Root cause**: `remember-mcp-oauth-service/src/server.ts:59` calls `createRememberServer(token, userId)` without passing `{ internal_type: 'agent' }` as the third argument
- **Why not client-side headers**: Claude Code has a long history of bugs where custom headers are dropped during OAuth discovery (issues #2831, #6204, #7290, #14976, #14977, #17069). The MCP spec supports custom headers in theory, but Claude's implementation is unreliable.

---

## Solution

**Auto-inject `{ internal_type: 'agent' }` server-side** for all OAuth MCP sessions.

The change is a single line in `remember-mcp-oauth-service/src/server.ts`:

```typescript
// Before (line 59):
const mcpServer = await createRememberServer(authInfo.token, userId);

// After:
const mcpServer = await createRememberServer(authInfo.token, userId, {
  internal_type: 'agent',
});
```

### Why server-side, not client-side

1. **The server knows best**: OAuth connections are always from AI agents (Claude CLI). The server is the authority on session type.
2. **Security**: Clients shouldn't self-declare capabilities that modify server behavior. Trust the auth layer, not the client.
3. **Reliability**: Client-side headers are buggy in Claude Code. Server-side injection works regardless of client implementation quality.
4. **Future-proofing**: New MCP clients with poor header implementations won't break agent memory.

### Alternatives rejected

| Alternative | Why rejected |
|-------------|-------------|
| Client-side `--header` flag | Claude Code header bugs (#2831, #7290, etc.) make this unreliable |
| URL query parameters (`?internal_type=agent`) | Would work with mcp-auth's `MCPServerFactoryExtras`, but oauth-service doesn't use mcp-auth |
| Migrate to mcp-auth wrapper | Overkill for a one-line fix; larger refactor for minimal gain |
| Token claims (embed type in JWT) | Requires changes to agentbase.me OAuth provider; over-engineered |

---

## Implementation

### Change in remember-mcp-oauth-service

**File**: `src/server.ts`
**Location**: Line 59 (inside the session creation block)

```typescript
// Current:
const mcpServer = await createRememberServer(authInfo.token, userId);

// New:
const mcpServer = await createRememberServer(authInfo.token, userId, {
  internal_type: 'agent',
});
```

### How this flows through remember-mcp

The `createRememberServer` function (remember-mcp `src/server-factory.ts:224-228`) accepts a third parameter:

```typescript
export async function createServer(
  accessToken: string,
  userId: string,
  options: ServerOptions | Record<string, string | string[] | undefined> = {}
): Promise<Server>
```

The `normalizeOptions()` function (`server-factory.ts:195-222`) maps flat keys to `InternalContext`:

```
{ internal_type: 'agent' }  →  { internalContext: { type: 'agent' } }
```

This enables all `remember_*_internal_memory` tools to function. Memories created via these tools get `content_type: 'agent'`.

### No changes needed in

- remember-core (already supports agent content type)
- remember-mcp (already handles `internal_type` in options)
- Claude CLI configuration (no custom headers needed)
- agentbase.me OAuth provider (no token claim changes)

---

## Benefits

- **Unblocks agent internal memory**: All `remember_*_internal_memory` tools work immediately for OAuth clients
- **Zero client configuration**: No `--header` flags, no JSON config, no environment variables
- **Reliable**: Not dependent on Claude Code's buggy header passthrough
- **Secure**: Server declares session type authoritatively; clients can't override
- **Minimal change**: One line of code, no architectural changes

---

## Trade-offs

- **All OAuth sessions are agent mode**: No way for a non-agent OAuth client to connect without agent context. Mitigated by: all current OAuth clients ARE agents (Claude CLI). If human-facing clients ever use this service, a conditional check can be added later.
- **Ghost mode not covered**: This only injects `internal_type: 'agent'`, not ghost context. Mitigated by: ghost mode is a separate concern that requires owner/accessor relationships, not relevant for self-authenticated agent sessions.

---

## Dependencies

- `remember-mcp` v3.16.0+ (supports `internal_type` in flat options — see CHANGELOG)
- `remember-mcp-oauth-service` (target of the change)

---

## Testing Strategy

- **Manual test**: Connect Claude CLI via OAuth, call `remember_create_internal_memory`, verify it succeeds (was failing before)
- **Unit test**: Mock `createRememberServer` call, verify third arg includes `{ internal_type: 'agent' }`
- **Regression**: Verify standard (non-internal) tools still work unchanged

---

## Migration Path

1. Apply one-line change to `remember-mcp-oauth-service/src/server.ts`
2. Deploy to Cloud Run
3. Existing OAuth sessions will pick up agent context on next connection
4. No client-side changes needed

---

## Key Design Decisions

### Architecture

| Decision | Choice | Rationale |
|---|---|---|
| Where to inject context | Server-side (OAuth service) | Server is authority on session type; client headers unreliable |
| What to inject | `{ internal_type: 'agent' }` only | Minimal necessary context; ghost mode is separate concern |
| Scope | All OAuth sessions | All current OAuth clients are Claude CLI agents |

### Security

| Decision | Choice | Rationale |
|---|---|---|
| Client header override | Not supported | Clients shouldn't self-declare capabilities that change server behavior |
| Future non-agent clients | Defer (add conditional later) | YAGNI — no non-agent OAuth clients exist or are planned |

---

## Future Considerations

- **Per-client type detection**: If non-agent OAuth clients ever exist, add a client type claim to the OAuth token or a registry lookup
- **Ghost mode via OAuth**: Would require additional OAuth scopes or claims to identify ghost owner/accessor relationships
- **Migration to mcp-auth**: If the OAuth service needs more extension points long-term, migrating to `@prmichaelsen/mcp-auth` wrapper would provide `MCPServerFactoryExtras`, `corsAllowedHeaders`, and other hooks

---

**Status**: Design Specification
**Recommendation**: Implement immediately — one-line change in remember-mcp-oauth-service
**Related Documents**:
- `agent/reports/audit-2-mcp-oauth-internal-memory-headers.md`
- remember-mcp `src/server-factory.ts` (normalizeOptions)
- remember-mcp-oauth-service `src/server.ts` (line 59)
