/**
 * Composite ID Utilities.
 *
 * Ported from remember-mcp/src/collections/composite-ids.ts.
 * Provides utilities for working with composite IDs in Memory Collection Pattern v2.
 * Format: {userId}.{memoryId}
 */

export interface CompositeIdComponents {
  userId: string;
  memoryId: string;
}

export class InvalidCompositeIdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCompositeIdError';
  }
}

/**
 * Generate a composite ID from user ID and memory ID.
 *
 * @throws {InvalidCompositeIdError} If userId or memoryId contains dots or is empty
 */
export function generateCompositeId(userId: string, memoryId: string): string {
  if (userId.includes('.')) {
    throw new InvalidCompositeIdError(`User ID cannot contain dots: ${userId}`);
  }
  if (memoryId.includes('.')) {
    throw new InvalidCompositeIdError(`Memory ID cannot contain dots: ${memoryId}`);
  }
  if (!userId.trim()) {
    throw new InvalidCompositeIdError('User ID cannot be empty');
  }
  if (!memoryId.trim()) {
    throw new InvalidCompositeIdError('Memory ID cannot be empty');
  }
  return `${userId}.${memoryId}`;
}

/**
 * Parse a composite ID into its components.
 *
 * @throws {InvalidCompositeIdError} If format is invalid
 */
export function parseCompositeId(compositeId: string): CompositeIdComponents {
  const parts = compositeId.split('.');
  if (parts.length !== 2) {
    throw new InvalidCompositeIdError(
      `Invalid composite ID format: ${compositeId}. Expected format: {userId}.{memoryId}`,
    );
  }
  const [userId, memoryId] = parts;
  if (!userId.trim()) {
    throw new InvalidCompositeIdError(`Invalid composite ID: ${compositeId}. User ID is empty`);
  }
  if (!memoryId.trim()) {
    throw new InvalidCompositeIdError(`Invalid composite ID: ${compositeId}. Memory ID is empty`);
  }
  return { userId, memoryId };
}

/**
 * Check if a string is a valid composite ID.
 */
export function isCompositeId(id: string): boolean {
  try {
    parseCompositeId(id);
    return true;
  } catch (error) {
    if (error instanceof InvalidCompositeIdError) return false;
    throw error;
  }
}

/**
 * Validate a composite ID (returns true or throws).
 */
export function validateCompositeId(id: string): true {
  parseCompositeId(id);
  return true;
}

/**
 * Extract user ID from a composite ID.
 */
export function getUserIdFromComposite(compositeId: string): string {
  return parseCompositeId(compositeId).userId;
}

/**
 * Extract memory ID from a composite ID.
 */
export function getMemoryIdFromComposite(compositeId: string): string {
  return parseCompositeId(compositeId).memoryId;
}

/**
 * Check if a composite ID belongs to a specific user.
 */
export function belongsToUser(compositeId: string, userId: string): boolean {
  try {
    return parseCompositeId(compositeId).userId === userId;
  } catch {
    return false;
  }
}
