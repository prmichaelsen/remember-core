# Task 37: Install openapi-typescript + Generate Types

**Milestone**: M9 — Client SDKs
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: None

---

## Objective

Install `openapi-typescript` and generate typed interfaces from the existing OpenAPI specs for both the svc and app tiers.

## Context

OpenAPI specs already exist: `docs/openapi.yaml` (svc tier) and `docs/openapi-web.yaml` (app tier). These are the source of truth for request/response shapes. Generated types ensure client SDKs stay in sync with the REST server.

## Steps

1. `npm install -D openapi-typescript`
2. Run `npx openapi-typescript docs/openapi.yaml -o src/clients/svc/v1/types.generated.ts`
3. Run `npx openapi-typescript docs/openapi-web.yaml -o src/app/types.generated.ts`
4. Verify generated types compile
5. Add npm scripts: `generate:types:svc`, `generate:types:app`

## Verification

- [ ] `openapi-typescript` installed as devDependency
- [ ] `src/clients/svc/v1/types.generated.ts` exists and compiles
- [ ] `src/app/types.generated.ts` exists and compiles
- [ ] npm scripts added for regeneration
