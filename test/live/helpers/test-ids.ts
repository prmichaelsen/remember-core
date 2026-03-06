import { randomUUID } from 'node:crypto';

// Weaviate collection names don't allow hyphens, so use hex-only run ID
const RUN_ID = randomUUID().replace(/-/g, '').slice(0, 8);

export const TEST_USER_ID = `live_test_${RUN_ID}`;
