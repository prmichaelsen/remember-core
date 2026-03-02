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
  type GetMemoryResult,
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

export {
  RelationshipService,
  type CreateRelationshipInput,
  type CreateRelationshipResult,
  type UpdateRelationshipInput,
  type UpdateRelationshipResult,
  type SearchRelationshipInput,
  type SearchRelationshipResult,
  type DeleteRelationshipInput,
  type DeleteRelationshipResult,
} from './relationship.service.js';

export {
  SpaceService,
  type PublishInput,
  type PublishResult,
  type RetractInput,
  type RetractResult,
  type ReviseInput,
  type ReviseResult,
  type ConfirmInput,
  type ConfirmResult,
  type DenyInput,
  type DenyResult,
  type ModerateInput,
  type ModerateResult,
  type SearchSpaceInput,
  type SearchSpaceResult,
  type QuerySpaceInput,
  type QuerySpaceResult,
  type ModerationAction,
  type ModerationFilter,
  type RevisionEntry,
  type RevisionResult,
  buildModerationFilter,
  parseRevisionHistory,
  buildRevisionHistory,
} from './space.service.js';

// Trust & ghost system services (ported from remember-mcp v3.11.0+)
export {
  TRUST_THRESHOLDS,
  buildTrustFilter,
  formatMemoryForPrompt,
  getTrustLevelLabel,
  getTrustInstructions,
  redactSensitiveFields,
  isTrustSufficient,
  resolveEnforcementMode,
  type FormattedMemory,
} from './trust-enforcement.service.js';

export {
  validateTrustAssignment,
  suggestTrustLevel,
  type TrustValidationResult,
} from './trust-validator.service.js';

export {
  checkMemoryAccess,
  handleInsufficientTrust,
  isMemoryBlocked,
  resetBlock,
  resolveAccessorTrustLevel,
  formatAccessResultMessage,
  canRevise,
  canOverwrite,
  TRUST_PENALTY,
  MAX_ATTEMPTS_BEFORE_BLOCK,
  type MemoryBlock,
  type AttemptRecord,
  type GhostConfigProvider,
  type EscalationStore,
  type PublishedMemoryACL,
  StubGhostConfigProvider,
  InMemoryEscalationStore,
} from './access-control.service.js';

export {
  getGhostConfig,
  setGhostConfigFields,
  setUserTrust,
  removeUserTrust,
  blockUser,
  unblockUser,
  isGhostEnabled,
  validateGhostConfigUpdate,
  FirestoreGhostConfigProvider,
} from './ghost-config.service.js';

export {
  FirestoreEscalationStore,
} from './escalation.service.js';

export {
  handleGetConfig,
  handleUpdateConfig,
  handleSetTrust,
  handleRemoveTrust,
  handleBlockUser,
  handleUnblockUser,
  type GhostConfigResult,
  type TrustResult,
} from './ghost-config-handler.service.js';
