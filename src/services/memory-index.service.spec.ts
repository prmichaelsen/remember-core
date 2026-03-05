import { MemoryIndexService } from './memory-index.service.js';

// Mock Firestore operations
jest.mock('../database/firestore/init.js', () => ({
  getDocument: jest.fn(),
  setDocument: jest.fn(),
}));

jest.mock('../database/firestore/paths.js', () => ({
  getMemoryIndexPath: jest.fn().mockReturnValue('e0.remember-mcp.memory_index'),
}));

import { getDocument, setDocument } from '../database/firestore/init.js';

const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;
const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;

const mockLogger = {
  debug: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
};

describe('MemoryIndexService', () => {
  let service: MemoryIndexService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MemoryIndexService(mockLogger);
  });

  describe('index()', () => {
    it('should write a Firestore doc with collection_name and created_at', async () => {
      mockSetDocument.mockResolvedValue(undefined);

      await service.index('uuid-abc-123', 'Memory_users_user1');

      expect(mockSetDocument).toHaveBeenCalledWith(
        'e0.remember-mcp.memory_index',
        'uuid-abc-123',
        expect.objectContaining({
          collection_name: 'Memory_users_user1',
          created_at: expect.any(String),
        }),
      );
    });

    it('should use ISO 8601 timestamp for created_at', async () => {
      mockSetDocument.mockResolvedValue(undefined);

      await service.index('uuid-abc-123', 'Memory_users_user1');

      const entry = mockSetDocument.mock.calls[0][2] as any;
      expect(() => new Date(entry.created_at).toISOString()).not.toThrow();
    });

    it('should log the indexing action', async () => {
      mockSetDocument.mockResolvedValue(undefined);

      await service.index('uuid-abc-123', 'Memory_users_user1');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('uuid-abc-123'),
      );
    });

    it('should propagate Firestore errors', async () => {
      mockSetDocument.mockRejectedValue(new Error('Firestore write failed'));

      await expect(service.index('uuid-abc-123', 'Memory_users_user1'))
        .rejects.toThrow('Firestore write failed');
    });
  });

  describe('lookup()', () => {
    it('should return collection_name for an indexed memory', async () => {
      mockGetDocument.mockResolvedValue({
        collection_name: 'Memory_users_user1',
        created_at: '2026-03-05T00:00:00.000Z',
      } as any);

      const result = await service.lookup('uuid-abc-123');

      expect(result).toBe('Memory_users_user1');
      expect(mockGetDocument).toHaveBeenCalledWith(
        'e0.remember-mcp.memory_index',
        'uuid-abc-123',
      );
    });

    it('should return null for a non-indexed memory', async () => {
      mockGetDocument.mockResolvedValue(null as any);

      const result = await service.lookup('uuid-not-found');

      expect(result).toBeNull();
    });

    it('should return null if doc exists but collection_name is missing', async () => {
      mockGetDocument.mockResolvedValue({} as any);

      const result = await service.lookup('uuid-bad-doc');

      expect(result).toBeNull();
    });

    it('should work for group collections', async () => {
      mockGetDocument.mockResolvedValue({
        collection_name: 'Memory_groups_grp1',
        created_at: '2026-03-05T00:00:00.000Z',
      } as any);

      const result = await service.lookup('uuid-group-mem');

      expect(result).toBe('Memory_groups_grp1');
    });

    it('should work for space collections', async () => {
      mockGetDocument.mockResolvedValue({
        collection_name: 'Memory_spaces_public',
        created_at: '2026-03-05T00:00:00.000Z',
      } as any);

      const result = await service.lookup('uuid-space-mem');

      expect(result).toBe('Memory_spaces_public');
    });
  });
});
