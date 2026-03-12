import {
  formatMoodAsMemory,
  formatPerceptionAsMemory,
  MoodMemoryProvider,
  PerceptionMemoryProvider,
  createCoreRegistry,
} from './synthetic-memory-providers';
import type { CoreMoodMemory, MoodState } from './mood.service';
import type { UserPerception } from './perception.service';

const baseMoodState: MoodState = {
  valence: 0.6,
  arousal: 0.4,
  confidence: 0.7,
  social_warmth: 0.5,
  coherence: 0.8,
  trust: 0.9,
};

function makeMood(overrides?: Partial<CoreMoodMemory>): CoreMoodMemory {
  return {
    user_id: 'user-1',
    state: { ...baseMoodState },
    color: 'warm amber',
    dominant_emotion: 'content',
    reasoning: 'stable interactions',
    motivation: 'keep building',
    goal: 'ship M76',
    purpose: 'help users remember',
    pressures: [{ source_memory_id: 'm1', direction: 'valence:+0.1', dimension: 'valence', magnitude: 0.1, reason: 'good news', created_at: '2026-03-12T00:00:00Z', decay_rate: 0.1 }],
    personality_sketch: '',
    communication_style: '',
    emotional_baseline: '',
    interests: [],
    patterns: [],
    needs: [],
    evolution_notes: '',
    confidence_level: 0.5,
    last_updated: '2026-03-12T10:00:00Z',
    rem_cycles_since_shift: 3,
    ...overrides,
  };
}

function makePerception(overrides?: Partial<UserPerception>): UserPerception {
  return {
    personality_sketch: 'curious and direct',
    communication_style: 'terse, technical',
    emotional_baseline: 'calm',
    interests: ['music', 'code'],
    patterns: ['late night coder'],
    needs: ['autonomy'],
    evolution_notes: 'becoming more open',
    confidence_level: 0.7,
    last_updated: '2026-03-12T09:00:00Z',
    ...overrides,
  };
}

describe('formatMoodAsMemory', () => {
  it('produces a memory-shaped object', () => {
    const result = formatMoodAsMemory(makeMood(), 'user-1');
    expect(result.id).toBe('synthetic:mood:user-1');
    expect(result.doc_type).toBe('memory');
    expect(result.content_type).toBe('system');
    expect(result.title).toBe('Current Mood State');
    expect(result.tags).toEqual(['core', 'mood', 'synthetic']);
    expect(result.user_id).toBe('user-1');
  });

  it('includes all 6 mood dimensions as flattened properties', () => {
    const result = formatMoodAsMemory(makeMood(), 'user-1');
    expect(result.mood_valence).toBe(0.6);
    expect(result.mood_arousal).toBe(0.4);
    expect(result.mood_confidence).toBe(0.7);
    expect(result.mood_social_warmth).toBe(0.5);
    expect(result.mood_coherence).toBe(0.8);
    expect(result.mood_trust).toBe(0.9);
  });

  it('produces human-readable content string', () => {
    const result = formatMoodAsMemory(makeMood(), 'user-1');
    const content = result.content as string;
    expect(content).toContain('Current mood: content');
    expect(content).toContain('Valence: 0.6');
    expect(content).toContain('Active pressures: 1');
    expect(content).toContain('Motivation: keep building');
    expect(content).toContain('Goal: ship M76');
  });

  it('handles empty derivation fields gracefully', () => {
    const mood = makeMood({ dominant_emotion: '', color: '', reasoning: '', motivation: '', goal: '', purpose: '' });
    const result = formatMoodAsMemory(mood, 'user-1');
    const content = result.content as string;
    expect(content).not.toContain('Current mood:');
    expect(content).not.toContain('Motivation:');
    expect(content).toContain('Valence:');
  });
});

describe('formatPerceptionAsMemory', () => {
  it('produces a memory-shaped object', () => {
    const result = formatPerceptionAsMemory(makePerception(), 'user-1');
    expect(result.id).toBe('synthetic:perception:user-1');
    expect(result.doc_type).toBe('memory');
    expect(result.content_type).toBe('system');
    expect(result.title).toBe('User Perception');
    expect(result.tags).toEqual(['core', 'perception', 'synthetic']);
  });

  it('produces human-readable content string', () => {
    const result = formatPerceptionAsMemory(makePerception(), 'user-1');
    const content = result.content as string;
    expect(content).toContain('Personality: curious and direct');
    expect(content).toContain('Communication style: terse, technical');
    expect(content).toContain('Interests: music, code');
    expect(content).toContain('Confidence: 0.7');
  });

  it('handles empty fields gracefully', () => {
    const perception = makePerception({
      personality_sketch: '',
      communication_style: '',
      interests: [],
      patterns: [],
      needs: [],
      evolution_notes: '',
    });
    const result = formatPerceptionAsMemory(perception, 'user-1');
    const content = result.content as string;
    expect(content).not.toContain('Personality:');
    expect(content).toContain('Confidence:');
    expect(content).toContain('Last updated:');
  });
});

describe('MoodMemoryProvider', () => {
  it('returns formatted mood when available', async () => {
    const moodService = { getMood: jest.fn().mockResolvedValue(makeMood()) } as any;
    const provider = new MoodMemoryProvider(moodService);
    const result = await provider.fetch('user-1', 'ghost-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('synthetic:mood:user-1');
    expect(moodService.getMood).toHaveBeenCalledWith('user-1', 'ghost-1');
  });

  it('returns null when no mood exists', async () => {
    const moodService = { getMood: jest.fn().mockResolvedValue(null) } as any;
    const provider = new MoodMemoryProvider(moodService);
    const result = await provider.fetch('user-1', 'ghost-1');
    expect(result).toBeNull();
  });

  it('has key "mood"', () => {
    const provider = new MoodMemoryProvider({} as any);
    expect(provider.key).toBe('mood');
  });
});

describe('PerceptionMemoryProvider', () => {
  it('returns formatted perception when available', async () => {
    const perceptionService = { getPerception: jest.fn().mockResolvedValue(makePerception()) } as any;
    const provider = new PerceptionMemoryProvider(perceptionService);
    const result = await provider.fetch('user-1', 'ghost-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('synthetic:perception:user-1');
  });

  it('returns null when no perception exists', async () => {
    const perceptionService = { getPerception: jest.fn().mockResolvedValue(null) } as any;
    const provider = new PerceptionMemoryProvider(perceptionService);
    const result = await provider.fetch('user-1', 'ghost-1');
    expect(result).toBeNull();
  });

  it('has key "perception"', () => {
    const provider = new PerceptionMemoryProvider({} as any);
    expect(provider.key).toBe('perception');
  });
});

describe('createCoreRegistry', () => {
  it('creates registry with mood provider when moodService provided', async () => {
    const moodService = { getMood: jest.fn().mockResolvedValue(makeMood()) } as any;
    const registry = createCoreRegistry({ moodService });
    const results = await registry.fetchAll('user-1', 'ghost-1');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('synthetic:mood:user-1');
  });

  it('creates registry with both providers', async () => {
    const moodService = { getMood: jest.fn().mockResolvedValue(makeMood()) } as any;
    const perceptionService = { getPerception: jest.fn().mockResolvedValue(makePerception()) } as any;
    const registry = createCoreRegistry({ moodService, perceptionService });
    const results = await registry.fetchAll('user-1', 'ghost-1');
    expect(results).toHaveLength(2);
  });

  it('creates empty registry when no services provided', async () => {
    const registry = createCoreRegistry({});
    const results = await registry.fetchAll('user-1', 'ghost-1');
    expect(results).toEqual([]);
  });
});
