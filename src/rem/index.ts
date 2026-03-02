/**
 * REM (Relationship Engine for Memories) barrel exports.
 */

export {
  type RemConfig,
  type RemCursorState,
  type RemCollectionState,
  DEFAULT_REM_CONFIG,
} from './rem.types.js';

export { listMemoryCollections } from './rem.collections.js';

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
} from './rem.service.js';
