/**
 * Tests for REM Haiku validation client.
 */

import { createMockHaikuClient, type HaikuValidationResult, type ClusterEvalResult } from './rem.haiku.js';

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

describe('HaikuClient - Confidence-based Evaluation', () => {
  it('should return confidence score for cohesive cluster', async () => {
    const evalResult: ClusterEvalResult = {
      confidence: 0.92,
      relationship_type: 'topical',
      observation: 'All about dogs',
      strength: 0.9,
      tags: ['dogs', 'pets'],
      reasoning: 'All memories relate to the same dog, Luna.',
    };

    const client = createMockHaikuClient(undefined, undefined, evalResult);
    const result = await client.evaluateCluster({
      memories: [
        { id: 'mem1', content: 'Luna went to the vet', tags: ['dogs'] },
        { id: 'mem2', content: 'Luna learned new tricks', tags: ['dogs'] },
      ],
    });

    expect(result.confidence).toBe(0.92);
    expect(result.relationship_type).toBe('topical');
    expect(result.reasoning).toBe('All memories relate to the same dog, Luna.');
    expect(result.sub_clusters).toBeUndefined();
  });

  it('should return low confidence with sub-clusters for mixed groups', async () => {
    const evalResult: ClusterEvalResult = {
      confidence: 0.3,
      relationship_type: 'mixed',
      observation: 'Heterogeneous group',
      strength: 0.3,
      tags: [],
      reasoning: 'Two distinct topics: dogs and books.',
      sub_clusters: [
        {
          memory_ids: ['mem1', 'mem2'],
          relationship_type: 'topical',
          observation: 'Dog memories',
          strength: 0.85,
          confidence: 0.9,
          tags: ['dogs'],
          reasoning: 'Both about dogs.',
        },
        {
          memory_ids: ['mem3', 'mem4'],
          relationship_type: 'topical',
          observation: 'Book memories',
          strength: 0.8,
          confidence: 0.88,
          tags: ['books'],
          reasoning: 'Both about reading.',
        },
      ],
    };

    const client = createMockHaikuClient(undefined, undefined, evalResult);
    const result = await client.evaluateCluster({
      memories: [
        { id: 'mem1', content: 'My dog Luna', tags: ['dogs'] },
        { id: 'mem2', content: 'Dog park visit', tags: ['dogs'] },
        { id: 'mem3', content: 'Reading Dune', tags: ['books'] },
        { id: 'mem4', content: 'Finished Dune Messiah', tags: ['books'] },
      ],
    });

    expect(result.confidence).toBe(0.3);
    expect(result.sub_clusters).toHaveLength(2);
    expect(result.sub_clusters![0].confidence).toBe(0.9);
    expect(result.sub_clusters![1].confidence).toBe(0.88);
  });

  it('should return near-zero confidence for unrelated memories', async () => {
    const evalResult: ClusterEvalResult = {
      confidence: 0.05,
      relationship_type: 'none',
      observation: '',
      strength: 0,
      tags: [],
      reasoning: 'No meaningful connections between these memories.',
    };

    const client = createMockHaikuClient(undefined, undefined, evalResult);
    const result = await client.evaluateCluster({
      memories: [
        { id: 'mem1', content: 'Random fact about penguins', tags: [] },
        { id: 'mem2', content: 'CSS grid tutorial', tags: ['coding'] },
      ],
    });

    expect(result.confidence).toBeLessThan(0.1);
    expect(result.sub_clusters).toBeUndefined();
  });

  it('mock defaults to 0.8 confidence when no eval result provided', async () => {
    const client = createMockHaikuClient();
    const result = await client.evaluateCluster({
      memories: [
        { id: 'mem1', content: 'test', tags: [] },
      ],
    });

    expect(result.confidence).toBe(0.8);
    expect(result.reasoning).toBe('Mock evaluation for testing.');
  });
});
