/**
 * Services module barrel exports.
 */

// Scaffolded base (keep for future use)
// export type { Logger } from './base.service.js';
// export { BaseService } from './base.service.js';
// export type { UserRepository } from './user.service.js';
// export { UserService } from './user.service.js';

// Ported services
export { PreferencesDatabaseService } from './preferences.service.js';

export {
  ConfirmationTokenService,
  type ConfirmationRequest,
} from './confirmation-token.service.js';

export {
  StubCredentialsProvider,
  createCredentialsProvider,
  credentialsProvider,
} from './credentials-provider.js';

export {
  getSpaceConfig,
  setSpaceConfig,
  DEFAULT_SPACE_CONFIG,
  type SpaceConfig,
} from './space-config.service.js';

export {
  MemoryService,
  type CreateMemoryInput,
  type CreateMemoryResult,
  type SearchMemoryInput,
  type SearchMemoryResult,
  type FindSimilarInput,
  type FindSimilarResult,
  type SimilarMemoryItem,
  type QueryMemoryInput,
  type QueryMemoryResult,
  type RelevantMemoryItem,
  type UpdateMemoryInput,
  type UpdateMemoryResult,
  type DeleteMemoryInput,
  type DeleteMemoryResult,
} from './memory.service.js';
