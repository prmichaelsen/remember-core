/**
 * Collections module barrel exports.
 */

export {
  generateCompositeId,
  parseCompositeId,
  isCompositeId,
  validateCompositeId,
  getUserIdFromComposite,
  getMemoryIdFromComposite,
  belongsToUser,
  compositeIdToUuid,
  InvalidCompositeIdError,
  type CompositeIdComponents,
} from './composite-ids.js';

export {
  addToSpaceIds,
  removeFromSpaceIds,
  addToGroupIds,
  removeFromGroupIds,
  isPublishedToSpace,
  isPublishedToGroup,
  getPublishedLocations,
  isPublished,
  getPublishedCount,
  initializeTracking,
  addMultipleSpaceIds,
  addMultipleGroupIds,
  type MemoryWithTracking,
  type PublishedLocations,
} from './tracking-arrays.js';

export {
  CollectionType,
  getCollectionName,
  parseCollectionName,
  validateCollectionName,
  isUserCollection,
  isSpacesCollection,
  isGroupCollection,
  InvalidCollectionNameError,
  type CollectionMetadata,
} from './dot-notation.js';
