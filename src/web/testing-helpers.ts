/**
 * Test helpers for web SDK tests.
 * Creates mock WebSDKContext with in-memory services.
 */

import { createMockCollection } from '../testing/weaviate-mock.js';
import { MemoryService } from '../services/memory.service.js';
import { RelationshipService } from '../services/relationship.service.js';
import { SpaceService } from '../services/space.service.js';
import { ConfirmationTokenService } from '../services/confirmation-token.service.js';
import { StubGhostConfigProvider, InMemoryEscalationStore } from '../services/access-control.service.js';
import type { WebSDKContext } from './context.js';
import type { Logger } from '../utils/logger.js';

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function createMockWebSDKContext(options?: {
  userId?: string;
  includeRelationships?: boolean;
}): WebSDKContext & { _collection: ReturnType<typeof createMockCollection> } {
  const userId = options?.userId ?? 'test-user';
  const collection = createMockCollection();
  const confirmationTokenService = new ConfirmationTokenService(noopLogger);

  const memoryService = new MemoryService(collection, userId, noopLogger);
  const spaceService = new SpaceService(
    {}, // mock weaviate client (not used in most tests)
    collection,
    userId,
    confirmationTokenService,
    noopLogger,
  );
  const relationshipService = options?.includeRelationships !== false
    ? new RelationshipService(collection, userId, noopLogger)
    : undefined;

  const ghostConfigProvider = new StubGhostConfigProvider();
  const escalationStore = new InMemoryEscalationStore();

  return {
    userId,
    memoryService,
    spaceService,
    confirmationTokenService,
    ghostConfigProvider,
    escalationStore,
    relationshipService,
    logger: noopLogger,
    _collection: collection,
  };
}
