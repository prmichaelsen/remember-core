# Task 107: REST Endpoints

**Milestone**: [M20 - Memory Ratings System](../../milestones/milestone-20-memory-ratings-system.md)
**Estimated Time**: 2-3 hours
**Dependencies**: [Task 105](task-105-rating-service.md)
**Status**: Not Started

---

## Objective

Define the REST API contract for rating operations. This task covers the OpenAPI spec additions and route design — actual route handler implementation lives in remember-rest-service, not remember-core.

---

## Context

remember-core defines the service layer and OpenAPI spec. The REST server (remember-rest-service) implements the actual Express/Fastify routes. This task adds the endpoint definitions to the OpenAPI spec so types can be generated.

**Design Doc**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)

---

## Steps

### 1. Add Rating Schemas to OpenAPI Spec

Update `docs/openapi.yaml`:

```yaml
components:
  schemas:
    RateMemoryRequest:
      type: object
      required: [rating]
      properties:
        rating:
          type: integer
          minimum: 1
          maximum: 5

    RatingResponse:
      type: object
      properties:
        previousRating:
          type: integer
          nullable: true
        newRating:
          type: integer
        ratingCount:
          type: integer
        ratingAvg:
          type: number
          nullable: true

    UserRatingResponse:
      type: object
      properties:
        rating:
          type: integer
        created_at:
          type: string
          format: date-time
        updated_at:
          type: string
          format: date-time
```

### 2. Add Rating Endpoint Paths

```yaml
paths:
  /api/svc/v1/memories/{id}/rating:
    put:
      operationId: rateMemory
      summary: Submit or update a rating for a memory
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RateMemoryRequest'
      responses:
        200:
          description: Rating submitted
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/RatingResponse'
        403:
          description: Cannot rate own memory or ghost mode
        404:
          description: Memory not found

    delete:
      operationId: retractRating
      summary: Retract a previously submitted rating
      responses:
        204:
          description: Rating retracted
        404:
          description: No rating found to retract

    get:
      operationId: getMyRating
      summary: Get the current user's rating for a memory
      responses:
        200:
          description: User's rating
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserRatingResponse'
        404:
          description: No rating found
```

### 3. Update Memory Schema

Add `rating_sum`, `rating_count`, `rating_bayesian`, `rating_avg` to the Memory response schema in the OpenAPI spec.

### 4. Regenerate Types

Run `npm run generate:types:svc` to regenerate `src/clients/svc/v1/types.generated.ts`.

---

## Verification

- [ ] OpenAPI spec validates (no YAML errors)
- [ ] Rating schemas defined with correct types and constraints
- [ ] Three endpoints defined (PUT, DELETE, GET) on `/memories/:id/rating`
- [ ] Memory response schema includes rating aggregate fields
- [ ] Types regenerated successfully
- [ ] `tsc --noEmit` clean

---

**Next Task**: [Task 108: SVC Client + OpenAPI Spec](task-108-svc-client-openapi-spec.md)
**Related Design Docs**: [agent/design/local.memory-ratings.md](../../design/local.memory-ratings.md)
