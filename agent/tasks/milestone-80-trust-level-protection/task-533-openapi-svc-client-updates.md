# Task 533: OpenAPI spec + SVC client updates

**Milestone**: M80 — Trust Level Protection
**Status**: Not Started
**Estimated Hours**: 2
**Dependencies**: task-531

---

## Objective

Update the OpenAPI spec and SVC client SDK to expose the new `requestSetTrustLevel` endpoint and remove trust from create/update schemas.

---

## Steps

### 1. Update OpenAPI spec (`docs/openapi.yaml`)

- Remove `trust` from `CreateMemoryInput` schema
- Remove `trust` from `UpdateMemoryInput` schema
- Add new endpoint:
  ```yaml
  /api/svc/v1/memories/{id}/request-set-trust-level:
    post:
      summary: Request a trust level change (returns confirmation token)
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [trust_level]
              properties:
                trust_level:
                  type: integer
                  minimum: 1
                  maximum: 5
      responses:
        200:
          description: Confirmation token created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/SetTrustLevelRequestResult'
  ```
- Add `SetTrustLevelRequestResult` and `SetTrustLevelConfirmResult` schemas

### 2. Regenerate types

```bash
npx openapi-typescript docs/openapi.yaml -o src/clients/svc/v1/types.generated.ts
```

### 3. Add SVC client method

In `src/clients/svc/v1/memories.ts`:

```typescript
async requestSetTrustLevel(
  userId: string,
  memoryId: string,
  input: { trust_level: number },
): Promise<SdkResponse<SetTrustLevelRequestResult>> {
  return this.http.request('POST', `/api/svc/v1/memories/${memoryId}/request-set-trust-level`, {
    body: input,
    userId,
  });
}
```

Confirmation is handled via existing `client.confirmations.confirm(userId, token)`.

### 4. Remove trust from existing SVC client create/update types

Verify the generated types no longer include `trust` on create/update inputs.

### 5. Update SVC client tests

- Add test for `requestSetTrustLevel` method
- Verify create/update no longer accept trust

---

## Verification

- [ ] OpenAPI spec has new endpoint documented
- [ ] OpenAPI spec create/update schemas have no `trust` field
- [ ] Generated types regenerated
- [ ] SVC client `requestSetTrustLevel()` method works
- [ ] Existing confirmations flow works for trust level changes
- [ ] SVC client tests pass
