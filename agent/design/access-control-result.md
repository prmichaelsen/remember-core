# Access Control Result Pattern

**Concept**: Discriminated union pattern for memory access control outcomes
**Created**: 2026-02-28
**Status**: Design Specification

---

## Overview

Defines a discriminated union `AccessResult` type with 6 variants to represent all possible outcomes of a memory access check. Replaces exception-based error handling with explicit, type-safe result types that consumers can pattern-match against.

Adapted from remember-mcp's `access-control-result-pattern.md` for the remember-core SDK.

---

## Problem Statement

- Memory access checks have multiple distinct failure modes (insufficient trust, blocked, no permission, not found, deleted) that require different handling.
- Exception-based approaches lose type information and force consumers to parse error messages.
- Each failure mode carries different metadata (e.g., `insufficient_trust` includes trust deficit and attempts remaining, `blocked` includes block date).
- Consumers need to format user-friendly messages differently per failure mode.

---

## Solution

Use a discriminated union on the `status` field. Each variant carries only the metadata relevant to that outcome.

```typescript
type AccessResultStatus =
  | 'granted'
  | 'insufficient_trust'
  | 'blocked'
  | 'no_permission'
  | 'not_found'
  | 'deleted';

type AccessResult =
  | AccessGranted
  | AccessInsufficientTrust
  | AccessBlocked
  | AccessNoPermission
  | AccessNotFound
  | AccessDeleted;
```

---

## Implementation

### Result Type Interfaces

```typescript
interface AccessGranted {
  status: 'granted';
  memory: Memory;
  access_level: 'owner' | 'trusted';
}

interface AccessInsufficientTrust {
  status: 'insufficient_trust';
  memory_id: string;
  required_trust: number;
  actual_trust: number;
  trust_deficit: number;
  attempts_made: number;
  attempts_remaining: number;
  new_trust_level: number | null; // Non-null only when penalty applied (repeated attempts)
}

interface AccessBlocked {
  status: 'blocked';
  memory_id: string;
  reason: string;
  blocked_at: Date;
  attempt_count: number;
  contact_owner: boolean;
}

interface AccessNoPermission {
  status: 'no_permission';
  owner_user_id: string;
  accessor_user_id: string;
  message: string;
}

interface AccessNotFound {
  status: 'not_found';
  memory_id: string;
}

interface AccessDeleted {
  status: 'deleted';
  memory_id: string;
  deleted_at: Date;
}
```

### Access Check Function Signature

```typescript
async function checkMemoryAccess(
  memory_id: string,
  accessor_user_id: string
): Promise<AccessResult>;
```

### Resolution Order

1. Fetch memory → `not_found` if missing
2. Check `deleted_at` → `deleted` if soft-deleted
3. Check owner → `granted` with `access_level: 'owner'` if self-access
4. Check permission → `no_permission` if no access grant exists
5. Check block list → `blocked` if memory-specific block active
6. Check trust level → `insufficient_trust` if `trust_level < trust_score` (penalty only after repeated attempts, not on first denial)
7. Return `granted` with `access_level: 'trusted'`

**Important**: The trust penalty (-0.1) is an escalation prevention mechanism that only applies after repeated attempts to access the same memory with insufficient trust. The first denial simply returns `insufficient_trust` without modifying the accessor's trust level.

### User-Friendly Message Formatter

```typescript
function formatAccessResult(result: AccessResult): string {
  switch (result.status) {
    case 'granted':
      return 'Access granted';
    case 'insufficient_trust':
      const msg = `Insufficient trust level. Need ${result.required_trust.toFixed(2)}, ` +
        `have ${result.actual_trust.toFixed(2)}.`;
      return result.new_trust_level != null
        ? `${msg} Trust reduced to ${result.new_trust_level.toFixed(2)}. ${result.attempts_remaining} attempts remaining.`
        : `${msg} ${result.attempts_remaining} attempts remaining before penalties apply.`;
    case 'blocked':
      return `Access blocked due to ${result.attempt_count} unauthorized attempts. ` +
        `Contact the memory owner to reset.`;
    case 'no_permission':
      return `No permission to access this user's memories.`;
    case 'not_found':
      return `Memory not found.`;
    case 'deleted':
      return `Memory was deleted on ${result.deleted_at.toLocaleDateString()}.`;
  }
}
```

### Consumer Usage Pattern

```typescript
const result = await checkMemoryAccess(memoryId, userId);

switch (result.status) {
  case 'granted':
    // Use result.memory — TypeScript narrows to AccessGranted
    return { content: result.memory.content };
  case 'insufficient_trust':
    // result.attempts_remaining is available
    return { error: formatAccessResult(result) };
  case 'blocked':
    // result.blocked_at, result.contact_owner available
    return { error: formatAccessResult(result) };
  default:
    return { error: formatAccessResult(result) };
}
```

---

## Benefits

- **Type safety**: TypeScript narrows the union on `status`, giving access to variant-specific fields
- **Exhaustive handling**: `switch` with `never` default catches missing cases at compile time
- **No exception parsing**: Consumers don't need to catch and interpret error messages
- **Composable**: Search functions can aggregate results (accessible vs. denied) without try/catch
- **Self-documenting**: Each variant's fields describe exactly what information is available

---

## Trade-offs

- **More types**: 6 interfaces + union vs. a single error class (mitigated by barrel exports)
- **Verbose switch statements**: Consumers must handle all variants (mitigated by `formatAccessResult()` helper)
- **Pattern adoption**: Different from exception-based patterns used elsewhere in the codebase

---

## Dependencies

- `src/types/memory.types.ts` — `Memory` interface (used in `AccessGranted`)
- Trust enforcement system — escalation logic populates `insufficient_trust` fields
- Firestore — block/attempt tracking for `blocked` variant

---

## Testing Strategy

- Unit test each variant: construct → format → verify message
- Unit test `checkMemoryAccess()`: one test per resolution path (owner, not found, deleted, blocked, insufficient trust, granted)
- Integration test: search with mixed access results, verify correct partitioning

---

## Migration Path

1. Task 16: Create `src/types/access-result.types.ts` with all 6 interfaces and union
2. Task 18: Create `AccessControlService.checkMemoryAccess()` returning `AccessResult`
3. Task 20: Unit tests for all 6 variants and resolution paths

---

## Future Considerations

- Extend pattern to other operations: `CreateResult`, `UpdateResult`, `PublishResult`
- Rate-limited variant for API consumers
- Audit trail integration — log all non-granted results

---

**Status**: Design Specification
**Recommendation**: Implement in Tasks 16, 18, 20
**Related Documents**: [trust-enforcement.md](trust-enforcement.md), [ghost-persona-system.md](ghost-persona-system.md), [milestone-5](../milestones/milestone-5-trust-and-ghost-system.md)
