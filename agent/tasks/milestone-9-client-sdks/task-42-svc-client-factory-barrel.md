# Task 42: Build Svc Client — Factory + Barrel + Tests

**Milestone**: M9 — Client SDKs
**Status**: Not Started
**Estimated Hours**: 3
**Dependencies**: Task 39, Task 40, Task 41

---

## Objective

Create the `createSvcClient(config)` factory function that composes all resource groups, plus the barrel export.

## Steps

1. Create `src/clients/svc/v1/index.ts`:
   - `createSvcClient(config: HttpClientConfig)` factory
   - Calls `assertServerSide()`
   - Instantiates `HttpClient` from config
   - Returns object with all resource groups:
     ```typescript
     {
       memories: MemoriesResource,
       relationships: RelationshipsResource,
       spaces: SpacesResource,
       confirmations: ConfirmationsResource,
       preferences: PreferencesResource,
       trust: TrustResource,
       health: HealthResource,
     }
     ```
   - Re-exports all types from `types.generated.ts`

2. Write colocated test: `src/clients/svc/v1/index.spec.ts`
   - Verify factory returns all 7 resource groups
   - Verify browser guard is called
   - Verify HttpClient receives config

## Verification

- [ ] `createSvcClient` returns all 7 resource groups (29 methods total)
- [ ] Browser guard called on creation
- [ ] Config passed through to HttpClient
- [ ] All resource types exported
- [ ] Tests pass
