import { randomUUID } from 'node:crypto';

// Weaviate collection names don't allow hyphens, so use hex-only run ID
const RUN_ID = randomUUID().replace(/-/g, '').slice(0, 8);

export const TEST_USER_ID = `live_test_${RUN_ID}`;

// Second user for operations that can't be self-applied (e.g. rating own memory)
export const TEST_USER_ID_2 = `live_test_${RUN_ID}_b`;
