/**
 * Tests for REM Haiku validation client.
 */

import { createMockHaikuClient, type HaikuValidationResult } from './rem.haiku.js';

describe('HaikuClient - Sub-cluster Detection', () => {
  it('should handle sub-cluster response when full cluster is rejected', async () => {
    // Mock response: cluster rejected but two sub-clusters identified
    const mockResult: HaikuValidationResult = {
      valid: false,
      reason: 'multiple distinct topics',
      sub_clusters: [
        {
          memory_ids: ['mem1', 'mem2', 'mem3'],
          relationship_type: 'topical',
          observation: 'Dog-related memories',
          strength: 0.8,
          confidence: 0.9,
          tags: ['dogs', 'pets'],
        },
        {
          memory_ids: ['mem4', 'mem5'],
          relationship_type: 'topical',
          observation: 'Cat-related memories',
          strength: 0.75,
          confidence: 0.85,
          tags: ['cats', 'pets'],
        },
      ],
    };

    const client = createMockHaikuClient(mockResult);

    const result = await client.validateCluster({
      memories: [
        { id: 'mem1', content: 'My dog loves to play fetch', tags: ['dogs'] },
        { id: 'mem2', content: 'Dog training tips', tags: ['dogs'] },
        { id: 'mem3', content: 'Vet appointment for dog', tags: ['dogs', 'health'] },
        { id: 'mem4', content: 'My cat is very independent', tags: ['cats'] },
        { id: 'mem5', content: 'Cat food recommendations', tags: ['cats'] },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.sub_clusters).toHaveLength(2);
    expect(result.sub_clusters![0].memory_ids).toEqual(['mem1', 'mem2', 'mem3']);
    expect(result.sub_clusters![0].observation).toBe('Dog-related memories');
    expect(result.sub_clusters![1].memory_ids).toEqual(['mem4', 'mem5']);
    expect(result.sub_clusters![1].observation).toBe('Cat-related memories');
  });

  it('should return valid=true when cluster is fully coherent', async () => {
    const mockResult: HaikuValidationResult = {
      valid: true,
      relationship_type: 'topical',
      observation: 'All about dogs',
      strength: 0.9,
      confidence: 0.95,
      tags: ['dogs', 'pets'],
    };

    const client = createMockHaikuClient(mockResult);

    const result = await client.validateCluster({
      memories: [
        { id: 'mem1', content: 'My dog loves to play fetch', tags: ['dogs'] },
        { id: 'mem2', content: 'Dog training tips', tags: ['dogs'] },
        { id: 'mem3', content: 'Vet appointment for dog', tags: ['dogs', 'health'] },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.relationship_type).toBe('topical');
    expect(result.observation).toBe('All about dogs');
    expect(result.sub_clusters).toBeUndefined();
  });

  it('should return valid=false with no sub-clusters when completely unrelated', async () => {
    const mockResult: HaikuValidationResult = {
      valid: false,
      reason: 'completely unrelated topics',
    };

    const client = createMockHaikuClient(mockResult);

    const result = await client.validateCluster({
      memories: [
        { id: 'mem1', content: 'Random test data', tags: [] },
        { id: 'mem2', content: 'Another unrelated thing', tags: [] },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.reason).toBe('completely unrelated topics');
    expect(result.sub_clusters).toBeUndefined();
  });

  it('should handle single sub-cluster (partial cluster)', async () => {
    // Only some memories are related, rest are noise
    const mockResult: HaikuValidationResult = {
      valid: false,
      reason: 'only partial coherence',
      sub_clusters: [
        {
          memory_ids: ['mem2', 'mem3', 'mem4'],
          relationship_type: 'project',
          observation: 'Website development project',
          strength: 0.85,
          confidence: 0.9,
          tags: ['coding', 'web'],
        },
      ],
    };

    const client = createMockHaikuClient(mockResult);

    const result = await client.validateCluster({
      memories: [
        { id: 'mem1', content: 'Random recipe', tags: ['food'] },
        { id: 'mem2', content: 'Fixed React bug', tags: ['coding'] },
        { id: 'mem3', content: 'Updated website styles', tags: ['coding', 'css'] },
        { id: 'mem4', content: 'Deployed to production', tags: ['coding'] },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.sub_clusters).toHaveLength(1);
    expect(result.sub_clusters![0].memory_ids).toEqual(['mem2', 'mem3', 'mem4']);
    expect(result.sub_clusters![0].memory_ids).not.toContain('mem1'); // Recipe excluded
  });
});
