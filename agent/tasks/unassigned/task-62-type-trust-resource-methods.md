# Task 62: Type TrustResource Methods with Generated OpenAPI Types

**Milestone**: Unassigned (bug fix related to M9 - Client SDKs)
**Estimated Time**: 1-2 hours
**Dependencies**: None
**Status**: Complete

---

## Objective

Replace `SdkResponse<unknown>` and `Record<string, unknown>` in `TrustResource` with proper typed generics using the OpenAPI-generated types from `types.generated.ts`.

---

## Context

The `TrustResource` interface (`src/clients/svc/v1/trust.ts`) types all methods as `SdkResponse<unknown>` with `Record<string, unknown>` inputs. This caused a bug in agentbase.me where `svc.trust.getGhostConfig()` returned an `SdkResponse<unknown>` — the consumer used the result directly as a `GhostConfig` instead of extracting `.data.config`, because the types gave no guidance.

The OpenAPI-generated types (`types.generated.ts`) already define:
- `GhostConfigResult` — `{ success: boolean; config?: GhostConfig; message: string }`
- `UpdateGhostConfigInput` — `{ enabled?: boolean; public_ghost_enabled?: boolean; ... }`

These should be used to properly type the `TrustResource` methods, matching how other resources in the SVC client are typed.

**Bug reference**: agentbase.me v0.37.11 — `src/routes/api/settings/ghost.tsx` was returning raw `SdkResponse` object as the config because `getGhostConfig` returned `SdkResponse<unknown>`.

---

## Steps

### 1. Import Generated Types

In `src/clients/svc/v1/trust.ts`, import the relevant types from `types.generated.ts`:

```typescript
import type { components } from './types.generated.js';

type GhostConfigResult = components['schemas']['GhostConfigResult'];
type UpdateGhostConfigInput = components['schemas']['UpdateGhostConfigInput'];
```

### 2. Type TrustResource Interface

Replace `unknown` generics with proper types:

```typescript
export interface TrustResource {
  getGhostConfig(userId: string): Promise<SdkResponse<GhostConfigResult>>;
  updateGhostConfig(userId: string, input: UpdateGhostConfigInput): Promise<SdkResponse<GhostConfigResult>>;
  setUserTrust(userId: string, input: { target_user_id: string; trust_level: number }): Promise<SdkResponse<{ success: boolean; message: string }>>;
  removeUserTrust(userId: string, input: { target_user_id: string }): Promise<SdkResponse<{ success: boolean; message: string }>>;
  blockUser(userId: string, input: { target_user_id: string }): Promise<SdkResponse<{ success: boolean; message: string }>>;
  unblockUser(userId: string, input: { target_user_id: string }): Promise<SdkResponse<{ success: boolean; message: string }>>;
  checkAccess(userId: string, input: { memory_id: string; accessor_user_id: string }): Promise<SdkResponse<{ accessible: boolean; trust_tier: string; reason?: string }>>;
}
```

### 3. Update createTrustResource Implementation

The implementation should continue to work as-is since `http.request` returns generic `SdkResponse<T>`. Just ensure the generic parameter is passed through.

### 4. Update Consumers

After typing, consumers like agentbase.me can use:
```typescript
const result = await svc.trust.getGhostConfig(user.uid)
const config = result.data?.config  // properly typed as GhostConfig | undefined
```

Instead of the current cast-heavy:
```typescript
const config = (result.data as Record<string, unknown> | null)?.config ?? null
```

### 5. Run Tests

Ensure all existing tests pass with the new types.

---

## Verification

- [ ] `TrustResource` interface uses `SdkResponse<GhostConfigResult>` instead of `SdkResponse<unknown>`
- [ ] `updateGhostConfig` input is typed as `UpdateGhostConfigInput` instead of `Record<string, unknown>`
- [ ] All other trust methods have proper input/output types
- [ ] TypeScript compiles without errors
- [ ] All existing tests pass
- [ ] Exported types are accessible to consumers via `@prmichaelsen/remember-core`

---

## Expected Output

**Files Modified**:
- `src/clients/svc/v1/trust.ts` — Typed interface and factory

**Key Improvement**: Consumers get compile-time safety when using trust methods, preventing the class of bug seen in agentbase.me where `SdkResponse` was confused with the inner data.

---

## Notes

- This is consistent with how OpenAPI types are already used elsewhere in the codebase
- Other resources in the SVC client may also benefit from the same treatment (audit recommended)
- The agentbase.me workaround (`Record<string, unknown>` casts) can be cleaned up after this ships
