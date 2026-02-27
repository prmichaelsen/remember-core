// examples/mcp/user.tools.ts
// Pattern: Adapter MCP (core-sdk.adapter-mcp.md)
//
// Registers MCP tools that expose UserService methods to AI models.
// Each tool handler:
//   1. Validates input (Zod raises McpError(InvalidParams) on failure)
//   2. Calls UserService — all business logic lives there
//   3. Branches on Result<T,E> — returns JSON on Ok, throws McpError on Err
//
// Business logic belongs in UserService, not here.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { UserService } from '../../src/services';
import { isOk, toUserDTO } from '../../src/types';
import { isAppError, AppErrorUnion } from '../../src/errors';

// ─── MCP error mapping ────────────────────────────────────────────────────────

const MCP_CODE_MAP: Record<AppErrorUnion['kind'], ErrorCode> = {
  validation:   ErrorCode.InvalidParams,
  not_found:    ErrorCode.InvalidParams,
  unauthorized: ErrorCode.InvalidRequest,
  forbidden:    ErrorCode.InvalidRequest,
  conflict:     ErrorCode.InvalidRequest,
  rate_limit:   ErrorCode.InternalError,
  external:     ErrorCode.InternalError,
  internal:     ErrorCode.InternalError,
};

function toMcpError(error: AppErrorUnion): McpError {
  const code = MCP_CODE_MAP[error.kind];
  return new McpError(code, error.message);
}

// ─── Tool registration ────────────────────────────────────────────────────────

/**
 * Register all user tools on an McpServer.
 * Call this once during server initialization before connecting transport.
 */
export function registerUserTools(server: McpServer, service: UserService): void {

  // ── get_user ───────────────────────────────────────────────────────────────
  server.tool(
    'get_user',
    'Get a user by ID. Returns the user object or an error if not found.',
    {
      id: z.string().describe('The user ID (e.g., usr_abc123)'),
    },
    async ({ id }) => {
      const parsed = service.parseUserId(id);
      if (!isOk(parsed)) {
        throw toMcpError(parsed.error);
      }

      const result = await service.findUser(parsed.value);
      if (!isOk(result)) {
        throw toMcpError(result.error);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(toUserDTO(result.value), null, 2) }],
      };
    }
  );

  // ── create_user ────────────────────────────────────────────────────────────
  server.tool(
    'create_user',
    'Create a new user account. Returns the created user or an error if validation fails or email is already taken.',
    {
      email: z.string().email().describe('User email address'),
      name:  z.string().min(1).describe('Display name'),
      role:  z.enum(['admin', 'member', 'viewer']).optional()
               .describe('User role (default: member)'),
    },
    async ({ email, name, role }) => {
      const result = await service.createUser({ email, name, role });
      if (!isOk(result)) {
        throw toMcpError(result.error);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(toUserDTO(result.value), null, 2) }],
      };
    }
  );

  // ── list_users ─────────────────────────────────────────────────────────────
  server.tool(
    'list_users',
    'List users with optional role filter and cursor-based pagination. Returns items, total count, and next cursor.',
    {
      role:   z.enum(['admin', 'member', 'viewer']).optional()
                .describe('Filter by role'),
      cursor: z.string().optional()
                .describe('Pagination cursor from a previous list_users response'),
      limit:  z.number().int().min(1).max(100).optional()
                .describe('Maximum number of results to return (default: 20)'),
    },
    async ({ role, cursor, limit }) => {
      const result = await service.listUsers({ role, cursor, limit });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { ...result, items: result.items.map(toUserDTO) },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
