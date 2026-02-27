/**
 * Dot Notation Collection Utilities.
 *
 * Ported from remember-mcp/src/collections/dot-notation.ts.
 * Utilities for Memory Collection Pattern v2 dot notation collection naming.
 *
 * Collection Types:
 * - USERS: Memory_users_{userId}
 * - SPACES: Memory_spaces_public
 * - GROUPS: Memory_groups_{groupId}
 */

export enum CollectionType {
  USERS = 'USERS',
  SPACES = 'SPACES',
  GROUPS = 'GROUPS',
}

export interface CollectionMetadata {
  type: CollectionType;
  id?: string;
  name: string;
}

export class InvalidCollectionNameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCollectionNameError';
  }
}

/**
 * Get the Weaviate collection name for a given type and optional ID.
 */
export function getCollectionName(type: CollectionType, id?: string): string {
  switch (type) {
    case CollectionType.USERS:
      if (!id) throw new InvalidCollectionNameError('User ID is required for USERS collection type');
      if (id.includes('.')) throw new InvalidCollectionNameError(`User ID cannot contain dots: ${id}`);
      return `Memory_users_${id}`;
    case CollectionType.SPACES:
      return 'Memory_spaces_public';
    case CollectionType.GROUPS:
      if (!id) throw new InvalidCollectionNameError('Group ID is required for GROUPS collection type');
      if (id.includes('.')) throw new InvalidCollectionNameError(`Group ID cannot contain dots: ${id}`);
      return `Memory_groups_${id}`;
    default:
      throw new InvalidCollectionNameError(`Unknown collection type: ${type}`);
  }
}

/**
 * Parse a collection name into its components.
 */
export function parseCollectionName(name: string): CollectionMetadata {
  const match = name.match(/^Memory_(users|spaces|groups)_(.+)$/);
  if (!match) {
    throw new InvalidCollectionNameError(
      `Invalid collection name format: ${name}. Expected format: Memory_{type}_{id}`,
    );
  }
  const [, typeStr, idOrPublic] = match;
  switch (typeStr) {
    case 'users':
      return { type: CollectionType.USERS, id: idOrPublic, name };
    case 'spaces':
      if (idOrPublic !== 'public') {
        throw new InvalidCollectionNameError(
          `Invalid SPACES collection name: ${name}. Expected: Memory_spaces_public`,
        );
      }
      return { type: CollectionType.SPACES, id: undefined, name };
    case 'groups':
      return { type: CollectionType.GROUPS, id: idOrPublic, name };
    default:
      throw new InvalidCollectionNameError(`Unknown collection type: ${typeStr}`);
  }
}

export function validateCollectionName(name: string): boolean {
  try {
    parseCollectionName(name);
    return true;
  } catch (error) {
    if (error instanceof InvalidCollectionNameError) return false;
    throw error;
  }
}

export function isUserCollection(name: string): boolean {
  try {
    return parseCollectionName(name).type === CollectionType.USERS;
  } catch {
    return false;
  }
}

export function isSpacesCollection(name: string): boolean {
  return name === 'Memory_spaces_public';
}

export function isGroupCollection(name: string): boolean {
  try {
    return parseCollectionName(name).type === CollectionType.GROUPS;
  } catch {
    return false;
  }
}
