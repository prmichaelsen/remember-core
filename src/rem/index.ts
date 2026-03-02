/**
 * REM (Relationship Engine for Memories) barrel exports.
 * Thin re-export barrel — actual sources live in src/services/rem.*.ts
 */

export {
  type RemConfig,
  type RemCursorState,
  type RemCollectionState,
  DEFAULT_REM_CONFIG,
} from '../services/rem.types.js';

export { getNextMemoryCollection } from '../services/rem.collections.js';

export { RemStateStore } from '../services/rem.state.js';

export {
  type MemoryCandidate,
  type Cluster,
  type ClusterAction,
  selectCandidates,
  formClusters,
  resolveClusterActions,
  shouldSplit,
  splitCluster,
} from '../services/rem.clustering.js';

export {
  type HaikuValidationInput,
  type HaikuValidationResult,
  type HaikuClient,
  createHaikuClient,
  createMockHaikuClient,
} from '../services/rem.haiku.js';

export {
  RemService,
  type RemServiceDeps,
  type RunCycleResult,
} from '../services/rem.service.js';
