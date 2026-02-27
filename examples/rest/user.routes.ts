// examples/rest/user.routes.ts
// Pattern: Adapter REST (core-sdk.adapter-rest.md)
//
// Express route handlers for user endpoints. Each handler:
//   1. Parses input from request
//   2. Calls UserService (all business logic lives there)
//   3. Branches on Result<T,E> — never accesses .value without checking isOk()
//   4. Returns UserDTO (never the raw User entity)
//
// Business logic belongs in UserService, not here.

import { Router, Request, Response, NextFunction } from 'express';
import { UserService } from '../../src/services';
import { isOk, toUserDTO } from '../../src/types';

export function userRoutes(service: UserService): Router {
  const router = Router();

  // GET /api/users/:id
  // Returns 200 + UserDTO, or 400 (invalid id) / 404 (not found)
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    const parsed = service.parseUserId(req.params.id);
    if (!isOk(parsed)) {
      return next(parsed.error); // ValidationError → 400
    }

    const result = await service.findUser(parsed.value);
    if (isOk(result)) {
      return res.status(200).json(toUserDTO(result.value));
    }
    next(result.error); // NotFoundError → 404
  });

  // POST /api/users
  // Body: { email, name, role? }
  // Returns 201 + UserDTO, or 400 (validation) / 409 (conflict)
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    const result = await service.createUser(req.body);
    if (isOk(result)) {
      return res.status(201).json(toUserDTO(result.value));
    }
    next(result.error); // ValidationError → 400, ConflictError → 409
  });

  // GET /api/users?role=member&cursor=xxx&limit=20
  // Returns 200 + PaginatedResult<UserDTO>
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const opts = {
        role: req.query.role as 'admin' | 'member' | 'viewer' | undefined,
        cursor: req.query.cursor as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      };

      const result = await service.listUsers(opts);
      return res.status(200).json({
        ...result,
        items: result.items.map(toUserDTO),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
