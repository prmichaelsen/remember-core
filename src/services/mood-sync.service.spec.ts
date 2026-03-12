import {
  getMoodMemoryId,
  formatMoodContent,
  buildGhostTags,
  buildMoodMemoryProperties,
  syncMoodToMemory,
} from './mood-sync.service.js';
import { createInitialMood, type CoreMoodMemory } from './mood.service.js';

// ─── Helpers ────────────────────────────────────────────────────────────

function createTestMood(overrides: Partial<CoreMoodMemory> = {}): CoreMoodMemory {
  return {
    ...createInitialMood('test-user'),
    dominant_emotion: 'content',
    color: 'warm amber',
    reasoning: 'stable interactions',
    motivation: 'keep building',
    goal: 'ship M76',
    purpose: 'help users remember',
    personality_sketch: 'curious and methodical',
    communication_style: 'direct',
    emotional_baseline: 'calm',
    interests: ['music', 'code'],
    patterns: ['evening work sessions'],
    needs: ['creative outlets'],
    evolution_notes: 'becoming more confident',
    state: {
      valence: 0.6,
      arousal: 0.4,
      confidence: 0.7,
      social_warmth: 0.5,
      coherence: 0.8,
      trust: 0.9,
    },
    pressures: [
      {
        source_memory_id: 'mem-1',
        direction: 'valence:+0.2',
        dimension: 'valence',
        magnitude: 0.2,
        reason: 'positive interaction',
        created_at: '2026-03-12T10:00:00Z',
        decay_rate: 0.15,
      },
    ],
    ...overrides,
  };
}

function createMockCollection() {
  const store = new Map<string, { properties: Record<string, unknown> }>();

  return {
    _store: store,
    query: {
      fetchObjectById: jest.fn(async (id: string) => {
        const obj = store.get(id);
        return obj ? { uuid: id, properties: obj.properties } : null;
      }),
    },
    data: {
      insert: jest.fn(async ({ id, properties }: any) => {
        store.set(id, { properties });
        return id;
      }),
      replace: jest.fn(async ({ id, properties }: any) => {
        store.set(id, { properties });
      }),
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('getMoodMemoryId', () => {
  it('returns a deterministic UUID for the same inputs', () => {
    const id1 = getMoodMemoryId('user-1', 'ghost_owner:space:the_void');
    const id2 = getMoodMemoryId('user-1', 'ghost_owner:space:the_void');
    expect(id1).toBe(id2);
  });

  it('returns different UUIDs for different users', () => {
    const id1 = getMoodMemoryId('user-1', 'ghost_owner:space:the_void');
    const id2 = getMoodMemoryId('user-2', 'ghost_owner:space:the_void');
    expect(id1).not.toBe(id2);
  });

  it('returns different UUIDs for different ghosts', () => {
    const id1 = getMoodMemoryId('user-1', 'ghost_owner:space:the_void');
    const id2 = getMoodMemoryId('user-1', 'ghost_owner:user-1');
    expect(id1).not.toBe(id2);
  });

  it('returns a valid UUID v5 format', () => {
    const id = getMoodMemoryId('user-1', 'ghost_owner:space:the_void');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('formatMoodContent', () => {
  it('includes mood label and color', () => {
    const mood = createTestMood();
    const content = formatMoodContent(mood);
    expect(content).toContain('Current mood: content (warm amber)');
  });

  it('includes all 6 mood dimensions', () => {
    const mood = createTestMood();
    const content = formatMoodContent(mood);
    expect(content).toContain('Valence: 0.600');
    expect(content).toContain('Arousal: 0.400');
    expect(content).toContain('Confidence: 0.700');
    expect(content).toContain('Social Warmth: 0.500');
    expect(content).toContain('Coherence: 0.800');
    expect(content).toContain('Trust: 0.900');
  });

  it('includes directional state', () => {
    const mood = createTestMood();
    const content = formatMoodContent(mood);
    expect(content).toContain('Motivation: keep building');
    expect(content).toContain('Goal: ship M76');
    expect(content).toContain('Purpose: help users remember');
  });

  it('includes perception fields', () => {
    const mood = createTestMood();
    const content = formatMoodContent(mood);
    expect(content).toContain('Personality: curious and methodical');
    expect(content).toContain('Communication style: direct');
    expect(content).toContain('Interests: music, code');
    expect(content).toContain('Patterns: evening work sessions');
    expect(content).toContain('Needs: creative outlets');
    expect(content).toContain('Evolution: becoming more confident');
  });

  it('includes pressure count', () => {
    const mood = createTestMood();
    const content = formatMoodContent(mood);
    expect(content).toContain('Active pressures: 1');
  });

  it('omits empty labels', () => {
    const mood = createTestMood({
      dominant_emotion: '',
      color: '',
      reasoning: '',
      motivation: '',
      personality_sketch: '',
    });
    const content = formatMoodContent(mood);
    expect(content).not.toContain('Current mood:');
    expect(content).not.toContain('Reasoning:');
    expect(content).not.toContain('Motivation:');
    expect(content).not.toContain('Personality:');
  });
});

describe('buildGhostTags', () => {
  it('tags space ghosts as ghost_type:space', () => {
    const tags = buildGhostTags('ghost_owner:space:the_void');
    expect(tags).toEqual(['ghost', 'ghost_type:space', 'ghost_owner:space:the_void']);
  });

  it('tags personal ghosts as ghost_type:personal', () => {
    const tags = buildGhostTags('ghost_owner:user-1');
    expect(tags).toEqual(['ghost', 'ghost_type:personal', 'ghost_owner:user-1']);
  });
});

describe('buildMoodMemoryProperties', () => {
  it('uses content_type ghost', () => {
    const mood = createTestMood();
    const props = buildMoodMemoryProperties(mood, 'user-1', 'ghost_owner:space:the_void');
    expect(props.content_type).toBe('ghost');
  });

  it('uses doc_type memory', () => {
    const mood = createTestMood();
    const props = buildMoodMemoryProperties(mood, 'user-1', 'ghost_owner:space:the_void');
    expect(props.doc_type).toBe('memory');
  });

  it('includes correct tags', () => {
    const mood = createTestMood();
    const props = buildMoodMemoryProperties(mood, 'user-1', 'ghost_owner:space:the_void');
    expect(props.tags).toEqual([
      'ghost', 'ghost_type:space', 'ghost_owner:space:the_void',
      'system:mood', 'auto_sync',
    ]);
  });

  it('sets user_id', () => {
    const mood = createTestMood();
    const props = buildMoodMemoryProperties(mood, 'user-1', 'ghost_owner:space:the_void');
    expect(props.user_id).toBe('user-1');
  });

  it('includes formatted content', () => {
    const mood = createTestMood();
    const props = buildMoodMemoryProperties(mood, 'user-1', 'ghost_owner:space:the_void');
    expect(props.content).toContain('Valence: 0.600');
  });
});

describe('syncMoodToMemory', () => {
  it('inserts a new mood memory when none exists', async () => {
    const collection = createMockCollection();
    const mood = createTestMood();

    const result = await syncMoodToMemory(collection, mood, 'user-1', 'ghost_owner:space:the_void');

    expect(result.action).toBe('inserted');
    expect(result.id).toBeTruthy();
    expect(collection.data.insert).toHaveBeenCalledTimes(1);
    expect(collection.data.replace).not.toHaveBeenCalled();
  });

  it('replaces an existing mood memory', async () => {
    const collection = createMockCollection();
    const mood = createTestMood();
    const moodMemoryId = getMoodMemoryId('user-1', 'ghost_owner:space:the_void');

    // Pre-populate with an existing memory
    collection._store.set(moodMemoryId, {
      properties: { version: 3, content: 'old content' },
    });

    const result = await syncMoodToMemory(collection, mood, 'user-1', 'ghost_owner:space:the_void');

    expect(result.action).toBe('replaced');
    expect(result.id).toBe(moodMemoryId);
    expect(collection.data.replace).toHaveBeenCalledTimes(1);

    // Version should be incremented
    const stored = collection._store.get(moodMemoryId)!;
    expect(stored.properties.version).toBe(4);
  });

  it('uses the same deterministic UUID across calls', async () => {
    const collection = createMockCollection();
    const mood = createTestMood();

    const result1 = await syncMoodToMemory(collection, mood, 'user-1', 'ghost_owner:space:the_void');
    const result2 = await syncMoodToMemory(collection, mood, 'user-1', 'ghost_owner:space:the_void');

    expect(result1.id).toBe(result2.id);
  });

  it('does not duplicate — second call replaces first', async () => {
    const collection = createMockCollection();
    const mood = createTestMood();

    await syncMoodToMemory(collection, mood, 'user-1', 'ghost_owner:space:the_void');
    await syncMoodToMemory(collection, mood, 'user-1', 'ghost_owner:space:the_void');

    // Store should have exactly 1 entry
    expect(collection._store.size).toBe(1);
  });
});
