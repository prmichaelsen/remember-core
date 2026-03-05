/**
 * Tests for backfill-memory-index migration logic.
 *
 * Verifies that the MemoryIndexService correctly indexes memories
 * from Weaviate collections — the core operation the migration performs.
 */

import { MemoryIndexService } from '../../src/services/memory-index.service.js';

jest.mock('../../src/database/firestore/init.js', () => ({
  getDocument: jest.fn(),
  setDocument: jest.fn(),
}));

jest.mock('../../src/database/firestore/paths.js', () => ({
  getMemoryIndexPath: jest.fn().mockReturnValue('e0.remember-mcp.memory_index'),
}));

import { getDocument, setDocument } from '../../src/database/firestore/init.js';

const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;
const mockGetDocument = getDocument as jest.MockedFunction<typeof getDocument>;

const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('backfill-memory-index logic', () => {
  let indexService: MemoryIndexService;

  beforeEach(() => {
    jest.clearAllMocks();
    indexService = new MemoryIndexService(mockLogger);
  });

  it('indexes a memory UUID to its collection name', async () => {
    mockSetDocument.mockResolvedValue(undefined);

    await indexService.index('uuid-1', 'Memory_users_alice');

    expect(mockSetDocument).toHaveBeenCalledWith(
      'e0.remember-mcp.memory_index',
      'uuid-1',
      expect.objectContaining({
        collection_name: 'Memory_users_alice',
        created_at: expect.any(String),
      }),
    );
  });

  it('is idempotent — re-indexing overwrites with set()', async () => {
    mockSetDocument.mockResolvedValue(undefined);

    await indexService.index('uuid-1', 'Memory_users_alice');
    await indexService.index('uuid-1', 'Memory_users_alice');

    expect(mockSetDocument).toHaveBeenCalledTimes(2);
    // Both calls write the same data — set() is idempotent
  });

  it('indexes memories from different collection types', async () => {
    mockSetDocument.mockResolvedValue(undefined);

    await indexService.index('uuid-user', 'Memory_users_alice');
    await indexService.index('uuid-group', 'Memory_groups_team1');
    await indexService.index('uuid-space', 'Memory_spaces_public');

    expect(mockSetDocument).toHaveBeenCalledTimes(3);

    // Verify each collection name was stored correctly
    const calls = mockSetDocument.mock.calls;
    expect((calls[0][2] as any).collection_name).toBe('Memory_users_alice');
    expect((calls[1][2] as any).collection_name).toBe('Memory_groups_team1');
    expect((calls[2][2] as any).collection_name).toBe('Memory_spaces_public');
  });

  it('lookup returns the indexed collection name', async () => {
    mockGetDocument.mockResolvedValue({
      collection_name: 'Memory_users_alice',
      created_at: '2026-03-05T00:00:00.000Z',
    } as any);

    const result = await indexService.lookup('uuid-1');

    expect(result).toBe('Memory_users_alice');
  });

  it('lookup returns null for unindexed memories', async () => {
    mockGetDocument.mockResolvedValue(null as any);

    const result = await indexService.lookup('uuid-not-found');

    expect(result).toBeNull();
  });
});
