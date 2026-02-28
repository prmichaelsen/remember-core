/**
 * Test helpers for web SDK tests.
 * Creates mock WebSDKContext with in-memory services.
 */

import { createMockCollection } from '../testing/weaviate-mock';
import { MemoryService } from '../services/memory.service';
import { RelationshipService } from '../services/relationship.service';
import { SpaceService } from '../services/space.service';
import { ConfirmationTokenService } from '../services/confirmation-token.service';
import { StubGhostConfigProvider, InMemoryEscalationStore } from '../services/access-control.service';
import type { WebSDKContext } from './context';
import type { Logger } from '../utils/logger';

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
