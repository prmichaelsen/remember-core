import { createMockWeaviateClient } from '../testing/weaviate-mock.js';
import { listMemoryCollections } from './rem.collections.js';

describe('REM Collections', () => {
  describe('listMemoryCollections', () => {
    it('filters to Memory_* collections', async () => {
      const client = createMockWeaviateClient();

      // Create various collections
      client.collections.get('Memory_users_alice');
      client.collections.get('Memory_groups_team1');
      client.collections.get('Memory_spaces_public');
      client.collections.get('Template_alice');
      client.collections.get('Audit_alice');

      const result = await listMemoryCollections(client as any);
      expect(result).toEqual([
        'Memory_groups_team1',
        'Memory_spaces_public',
        'Memory_users_alice',
      ]);
    });

    it('returns sorted list', async () => {
      const client = createMockWeaviateClient();
      client.collections.get('Memory_users_charlie');
      client.collections.get('Memory_users_alice');
      client.collections.get('Memory_users_bob');

      const result = await listMemoryCollections(client as any);
      expect(result).toEqual([
        'Memory_users_alice',
        'Memory_users_bob',
        'Memory_users_charlie',
      ]);
    });

    it('excludes non-memory collections', async () => {
      const client = createMockWeaviateClient();
      client.collections.get('Other_collection');
      client.collections.get('NotMemory');

      const result = await listMemoryCollections(client as any);
      expect(result).toEqual([]);
    });
  });
});
