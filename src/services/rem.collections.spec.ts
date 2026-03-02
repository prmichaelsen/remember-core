import { getNextMemoryCollection } from './rem.collections.js';

// Mock the collection registry
jest.mock('../database/collection-registry.js', () => ({
  getNextRegisteredCollection: jest.fn(),
}));

import { getNextRegisteredCollection } from '../database/collection-registry.js';

const mockGetNext = getNextRegisteredCollection as jest.MockedFunction<
  typeof getNextRegisteredCollection
>;

describe('REM Collections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getNextMemoryCollection', () => {
    it('delegates to getNextRegisteredCollection with null cursor', async () => {
      mockGetNext.mockResolvedValue('Memory_users_alice');

      const result = await getNextMemoryCollection(null);

      expect(result).toBe('Memory_users_alice');
      expect(mockGetNext).toHaveBeenCalledWith(null);
    });

    it('delegates to getNextRegisteredCollection with cursor', async () => {
      mockGetNext.mockResolvedValue('Memory_users_bob');

      const result = await getNextMemoryCollection('Memory_users_alice');

      expect(result).toBe('Memory_users_bob');
      expect(mockGetNext).toHaveBeenCalledWith('Memory_users_alice');
    });

    it('returns null when registry is empty', async () => {
      mockGetNext.mockResolvedValue(null);

      const result = await getNextMemoryCollection(null);

      expect(result).toBeNull();
    });
  });
});
