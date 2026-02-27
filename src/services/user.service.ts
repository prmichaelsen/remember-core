// src/services/user.service.ts
// Demonstrates: Service Base, Result Types, Error Types, Shared Types patterns

import { BaseService, Logger } from './base.service';
import { ServiceConfig } from '../config/schema';
import { Result, ok, err } from '../types/result.types';
import {
  User,
  UserId,
  CreateUserInput,
  ListUsersInput,
  PaginatedResult,
  createPaginatedResult,
  toUserId,
  toEmailAddress,
  toTimestamp,
} from '../types/shared.types';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../errors/app-errors';

/**
 * Interface for the UserService's data repository.
 * Define this interface in your service; implement it with your actual DB client.
 * This separation makes the service testable without a real database.
 */
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  findAll(opts: { role?: string; cursor?: string; limit: number }): Promise<{
    users: User[];
    total: number;
    nextCursor: string | null;
  }>;
  create(input: Omit<User, 'id'>): Promise<User>;
}

/**
 * UserService — manages users using the core-sdk patterns.
 *
 * Demonstrates:
 * - BaseService lifecycle (initialize, shutdown)
 * - Result<T, E> for expected failures (not found, validation, conflict)
 * - throw for unexpected failures (repository errors bubble up)
 * - Layer-scoped ServiceConfig (only database + logging, not server config)
 */
export class UserService extends BaseService<ServiceConfig> {
  constructor(
    config: ServiceConfig,
    logger: Logger,
    private readonly repo: UserRepository
  ) {
    super(config, logger);
  }

  /**
   * Find a user by ID.
   * Returns Ok<User> on success, Err<NotFoundError> if not found.
   */
  async findUser(id: UserId): Promise<Result<User, NotFoundError>> {
    this.logger.debug('Finding user', { userId: id, service: this.name });

    const user = await this.repo.findById(id);
    if (!user) {
      return err(new NotFoundError('User', id));
    }

    return ok(user);
  }

  /**
   * Create a new user.
   * Returns Ok<User> on success, Err<ValidationError | ConflictError> on failure.
   */
  async createUser(
    input: CreateUserInput
  ): Promise<Result<User, ValidationError | ConflictError>> {
    this.logger.debug('Creating user', { email: input.email, service: this.name });

    // Validate
    const fieldErrors: Record<string, string[]> = {};
    if (!input.email.includes('@')) {
      fieldErrors.email = ['Must be a valid email address'];
    }
    if (input.name.trim().length < 2) {
      fieldErrors.name = ['Must be at least 2 characters'];
    }
    if (Object.keys(fieldErrors).length > 0) {
      return err(new ValidationError('Invalid user input', fieldErrors));
    }

    // Check for duplicates
    const existing = await this.repo.findByEmail(input.email);
    if (existing) {
      return err(
        new ConflictError(
          `User with email ${input.email} already exists`,
          { email: input.email }
        )
      );
    }

    const now = toTimestamp(new Date().toISOString());
    const user = await this.repo.create({
      email: toEmailAddress(input.email),
      name: input.name.trim(),
      role: input.role ?? 'member',
      createdAt: now,
      updatedAt: now,
    });

    this.logger.info('User created', { userId: user.id, service: this.name });
    return ok(user);
  }

  /**
   * List users with optional role filter and cursor-based pagination.
   */
  async listUsers(
    input: ListUsersInput = {}
  ): Promise<PaginatedResult<User>> {
    const limit = Math.min(input.limit ?? 20, 100);

    const { users, total, nextCursor } = await this.repo.findAll({
      role: input.role,
      cursor: input.cursor,
      limit,
    });

    return createPaginatedResult(users, total, nextCursor);
  }

  /**
   * Parse a raw string into a validated UserId.
   * Returns Err<ValidationError> if the value is invalid.
   */
  parseUserId(raw: string): Result<UserId, ValidationError> {
    try {
      return ok(toUserId(raw));
    } catch {
      return err(new ValidationError(`Invalid user ID: ${raw}`));
    }
  }
}
