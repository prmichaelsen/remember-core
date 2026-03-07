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
  type ResolveByIdResult,
  type SearchMemoryInput,
  type SearchMemoryResult,
  type FindSimilarInput,
  type FindSimilarResult,
  type SimilarMemoryItem,
  type QueryMemoryInput,
  type QueryMemoryResult,
  type RelevantMemoryItem,
  type TimeModeRequest,
  type TimeModeResult,
  type DensityModeRequest,
  type DensityModeResult,
  type DiscoveryModeRequest,
  type DiscoveryModeResult,
  type UpdateMemoryInput,
  type UpdateMemoryResult,
  type DeleteMemoryInput,
  type DeleteMemoryResult,
  type RecommendationModeRequest,
  type RecommendationModeResult,
  type RecommendedMemory,
  type PropertyModeRequest,
  type PropertyModeResult,
  type BroadSearchResult,
  type BroadModeRequest,
  type BroadModeResult,
  type RandomModeRequest,
  type RandomModeResult,
} from './memory.service.js';

export {
  RelationshipService,
  computeOverlap,
  type CreateRelationshipInput,
  type CreateRelationshipResult,
  type UpdateRelationshipInput,
  type UpdateRelationshipResult,
  type SearchRelationshipInput,
  type SearchRelationshipResult,
  type FindByMemoryIdsInput,
  type FindByMemoryIdsResult,
  type GetRelationshipResult,
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
  type DiscoverySpaceInput,
  type DiscoverySpaceResult,
  type RecommendationSpaceInput,
  type RecommendedSpaceMemory,
  type RecommendationSpaceResult,
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

// Job tracking system
export {
  type Job,
  type JobStep,
  type JobError,
  type JobType,
  type JobStatus,
  type JobStepStatus,
  type CreateJobInput,
  type JobProgressUpdate,
  type CompleteJobInput,
  DEFAULT_TTL_HOURS,
  TERMINAL_STATUSES,
} from './job.types.js';

export {
  JobService,
  type JobServiceDeps,
} from './job.service.js';

export {
  ImportJobWorker,
  type ImportJobParams,
} from './import-job.worker.js';

export {
  RemJobWorker,
  type RemJobParams,
  scheduleRemJobs,
} from './rem-job.worker.js';

// Import service
export {
  ImportService,
  chunkByTokens,
  estimateTokens,
  type ImportItem,
  type ImportInput,
  type ImportItemResult,
  type ImportResult,
} from './import.service.js';

// REM (Relationship Engine for Memories)
export {
  type RemConfig,
  type RemCursorState,
  type RemCollectionState,
  DEFAULT_REM_CONFIG,
} from './rem.types.js';

export { getNextMemoryCollection } from './rem.collections.js';

export { RemStateStore } from './rem.state.js';

export {
  type MemoryCandidate,
  type Cluster,
  type ClusterAction,
  selectCandidates,
  formClusters,
  resolveClusterActions,
  shouldSplit,
  splitCluster,
} from './rem.clustering.js';

export {
  type HaikuValidationInput,
  type HaikuValidationResult,
  type HaikuClient,
  createHaikuClient,
  createMockHaikuClient,
} from './rem.haiku.js';

export {
  RemService,
  type RemServiceDeps,
  type RunCycleResult,
  type Phase0Stats,
} from './rem.service.js';

// File extraction
export type { ExtractionResult, FileExtractor } from './extractors/index.js';
export { ExtractorRegistry, createDefaultRegistry } from './extractors/index.js';
export { downloadFile } from './extractors/index.js';
export { PlaintextExtractor } from './extractors/index.js';
export { HtmlExtractor } from './extractors/index.js';
export { PdfExtractor } from './extractors/index.js';
export type { DocumentAiClient, Logger as ExtractorLogger } from './extractors/index.js';
export { DocxExtractor } from './extractors/index.js';
export { ImageExtractor } from './extractors/index.js';
export type { VisionClient } from './extractors/index.js';
export { createVisionClient, type VisionClientConfig } from './extractors/index.js';
export { createDocumentAiClient, type DocumentAiClientConfig } from './extractors/index.js';
export { validateImportItems, type ValidationError as ImportValidationError } from './extractors/index.js';
export { ALLOWED_MIME_TYPES } from './extractors/index.js';

// Memory index (UUID → collection lookup)
export {
  MemoryIndexService,
  type MemoryIndexEntry,
} from './memory-index.service.js';

// Rating service
export {
  RatingService,
  type RatingServiceParams,
} from './rating.service.js';

// Discovery (byDiscovery sort mode)
export {
  interleaveDiscovery,
  DISCOVERY_RATIO,
  DISCOVERY_THRESHOLD,
  type InterleaveOptions,
  type DiscoveryItem,
} from './discovery.js';

// Recommendation (byRecommendation sort mode)
export {
  RecommendationService,
  type RecommendationServiceParams,
  type PreferenceCentroid,
  type CentroidComputationResult,
  MIN_PROFILE_SIZE,
  NEGATIVE_WEIGHT,
  VECTOR_FETCH_CAP,
  MIN_SIMILARITY,
} from './recommendation.service.js';

// Composite scoring (REM emotional weighting)
export {
  computeFeelSignificance,
  computeFunctionalSignificance,
  computeTotalSignificance,
  computeAllComposites,
  DEFAULT_WEIGHTS,
  type CompositeWeights,
  type DimensionScores,
  type CompositeResult,
} from './composite-scoring.js';

// Emotional scoring (REM emotional weighting)
export {
  EmotionalScoringService,
  DIMENSION_REGISTRY,
  buildScoringPrompt,
  parseScore,
  createAnthropicSubLlm,
  type EmotionalScoringServiceParams,
  type DimensionDefinition,
  type ScoringContext,
  type ScoringInput,
  type ScoringResult,
  type SubLlmProvider,
} from './emotional-scoring.service.js';

// Scoring context gathering (REM emotional weighting)
export {
  ScoringContextService,
  createCollectionStatsCache,
  type ScoringContextServiceParams,
  type ScoringContextResult,
  type NeighborResult,
  type CollectionStatsCache,
} from './scoring-context.service.js';

// REM metadata tracking
export {
  buildRemMetadataUpdate,
  type RemMetadataUpdate,
} from './rem-metadata.js';

// Content moderation
export {
  type ModerationCategory,
  type ModerationResult,
  type ModerationClient,
  createModerationClient,
  createMockModerationClient,
} from './moderation.service.js';

// Core Mood State
export {
  MoodService,
  NEUTRAL_STATE,
  createInitialMood,
  type CoreMoodMemory,
  type MoodState,
  type Pressure,
  type MoodDerivation,
} from './mood.service.js';
