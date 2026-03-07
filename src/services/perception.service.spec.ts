import {
  PerceptionService,
  extractPerception,
  computeConfidence,
  INITIAL_PERCEPTION,
} from './perception.service.js';
import { createInitialMood, CoreMoodMemory, MoodService } from './mood.service.js';
import { IDENTITY_DRIFT_RATE, BEHAVIOR_DRIFT_RATE } from './rem.constants.js';

// ─── Mock Helpers ────────────────────────────────────────────────────────

function createMockMoodService(mood: CoreMoodMemory | null = null) {
  let stored = mood;
  return {
    getMood: jest.fn(async () => stored),
    getOrInitialize: jest.fn(async () => stored ?? createInitialMood('test-user')),
    updateMood: jest.fn(async (_userId: string, _ghostId: string, update: Partial<CoreMoodMemory>) => {
      if (stored) {
        stored = { ...stored, ...update };
      }
    }),
    initializeMood: jest.fn(),
    addPressure: jest.fn(),
    setPressures: jest.fn(),
  } as unknown as MoodService;
}

function createFullMood(overrides: Partial<CoreMoodMemory> = {}): CoreMoodMemory {
  return {
    ...createInitialMood('test-user'),
    personality_sketch: 'Curious and analytical',
    communication_style: 'Direct but kind',
    emotional_baseline: 'Generally calm',
    interests: ['programming', 'music'],
    patterns: ['asks follow-up questions'],
    needs: ['clarity', 'autonomy'],
    evolution_notes: 'Growing more confident',
    confidence_level: 0.6,
    last_updated: '2026-03-07T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('PerceptionService', () => {
  const userId = 'test-user';
  const ghostId = 'ghost-1';

  describe('getPerception', () => {
    it('returns null when no mood exists', async () => {
      const mock = createMockMoodService(null);
      const svc = new PerceptionService({ moodService: mock });

      const result = await svc.getPerception(userId, ghostId);

      expect(result).toBeNull();
      expect(mock.getMood).toHaveBeenCalledWith(userId, ghostId);
    });

    it('extracts perception fields correctly from mood', async () => {
      const mood = createFullMood();
      const mock = createMockMoodService(mood);
      const svc = new PerceptionService({ moodService: mock });

      const result = await svc.getPerception(userId, ghostId);

      expect(result).toEqual({
        personality_sketch: 'Curious and analytical',
        communication_style: 'Direct but kind',
        emotional_baseline: 'Generally calm',
        interests: ['programming', 'music'],
        patterns: ['asks follow-up questions'],
        needs: ['clarity', 'autonomy'],
        evolution_notes: 'Growing more confident',
        confidence_level: 0.6,
        last_updated: '2026-03-07T00:00:00.000Z',
      });
    });
  });

  describe('initializePerception', () => {
    it('writes INITIAL_PERCEPTION defaults', async () => {
      const mood = createFullMood();
      const mock = createMockMoodService(mood);
      const svc = new PerceptionService({ moodService: mock });

      const result = await svc.initializePerception(userId, ghostId);

      expect(result.personality_sketch).toBe('');
      expect(result.communication_style).toBe('');
      expect(result.emotional_baseline).toBe('');
      expect(result.interests).toEqual([]);
      expect(result.patterns).toEqual([]);
      expect(result.needs).toEqual([]);
      expect(result.evolution_notes).toBe('');
      expect(mock.updateMood).toHaveBeenCalledWith(userId, ghostId, expect.objectContaining({
        personality_sketch: '',
        communication_style: '',
        emotional_baseline: '',
        interests: [],
        patterns: [],
        needs: [],
        evolution_notes: '',
        confidence_level: 0.2,
      }));
    });

    it('sets confidence_level to 0.2', async () => {
      const mood = createFullMood();
      const mock = createMockMoodService(mood);
      const svc = new PerceptionService({ moodService: mock });

      const result = await svc.initializePerception(userId, ghostId);

      expect(result.confidence_level).toBe(0.2);
    });
  });

  describe('getOrInitialize', () => {
    it('returns existing perception if present', async () => {
      const mood = createFullMood();
      const mock = createMockMoodService(mood);
      const svc = new PerceptionService({ moodService: mock });

      const result = await svc.getOrInitialize(userId, ghostId);

      expect(result.personality_sketch).toBe('Curious and analytical');
      expect(mock.updateMood).not.toHaveBeenCalled();
    });

    it('initializes if not found', async () => {
      const mock = createMockMoodService(null);
      const svc = new PerceptionService({ moodService: mock });

      const result = await svc.getOrInitialize(userId, ghostId);

      expect(result.confidence_level).toBe(0.2);
      expect(mock.updateMood).toHaveBeenCalled();
    });
  });

  describe('updatePerception', () => {
    it('partially updates fields and sets last_updated', async () => {
      const mood = createFullMood();
      const mock = createMockMoodService(mood);
      const svc = new PerceptionService({ moodService: mock });

      await svc.updatePerception(userId, ghostId, {
        personality_sketch: 'Updated sketch',
        interests: ['art'],
      });

      expect(mock.updateMood).toHaveBeenCalledWith(
        userId,
        ghostId,
        expect.objectContaining({
          personality_sketch: 'Updated sketch',
          interests: ['art'],
          last_updated: expect.any(String),
        }),
      );
    });
  });

  describe('appendEvolutionNote', () => {
    it('appends to evolution_notes string', async () => {
      const mood = createFullMood({ evolution_notes: 'First note' });
      const mock = createMockMoodService(mood);
      const svc = new PerceptionService({ moodService: mock });

      await svc.appendEvolutionNote(userId, ghostId, 'Second note');

      expect(mock.updateMood).toHaveBeenCalledWith(
        userId,
        ghostId,
        expect.objectContaining({
          evolution_notes: 'First note\nSecond note',
        }),
      );
    });

    it('handles empty initial notes', async () => {
      const mood = createFullMood({ evolution_notes: '' });
      const mock = createMockMoodService(mood);
      const svc = new PerceptionService({ moodService: mock });

      await svc.appendEvolutionNote(userId, ghostId, 'First note');

      expect(mock.updateMood).toHaveBeenCalledWith(
        userId,
        ghostId,
        expect.objectContaining({
          evolution_notes: 'First note',
        }),
      );
    });
  });

  describe('adjustConfidence', () => {
    it('increases confidence by delta', async () => {
      const mood = createFullMood({ confidence_level: 0.5 });
      const mock = createMockMoodService(mood);
      const svc = new PerceptionService({ moodService: mock });

      await svc.adjustConfidence(userId, ghostId, 0.1);

      expect(mock.updateMood).toHaveBeenCalledWith(
        userId,
        ghostId,
        expect.objectContaining({
          confidence_level: 0.6,
        }),
      );
    });

    it('clamps to 1 when exceeding upper bound', async () => {
      const mood = createFullMood({ confidence_level: 0.95 });
      const mock = createMockMoodService(mood);
      const svc = new PerceptionService({ moodService: mock });

      await svc.adjustConfidence(userId, ghostId, 0.2);

      expect(mock.updateMood).toHaveBeenCalledWith(
        userId,
        ghostId,
        expect.objectContaining({
          confidence_level: 1,
        }),
      );
    });

    it('clamps negative results to 0', async () => {
      const mood = createFullMood({ confidence_level: 0.1 });
      const mock = createMockMoodService(mood);
      const svc = new PerceptionService({ moodService: mock });

      await svc.adjustConfidence(userId, ghostId, -0.5);

      expect(mock.updateMood).toHaveBeenCalledWith(
        userId,
        ghostId,
        expect.objectContaining({
          confidence_level: 0,
        }),
      );
    });
  });
});

describe('extractPerception', () => {
  it('extracts correct fields from CoreMoodMemory', () => {
    const mood = createInitialMood('user-1');
    mood.personality_sketch = 'Thoughtful';
    mood.communication_style = 'Verbose';
    mood.emotional_baseline = 'Steady';
    mood.interests = ['math'];
    mood.patterns = ['iterates'];
    mood.needs = ['structure'];
    mood.evolution_notes = 'Note A';
    mood.confidence_level = 0.8;
    mood.last_updated = '2026-01-01T00:00:00.000Z';

    const result = extractPerception(mood);

    expect(result).toEqual({
      personality_sketch: 'Thoughtful',
      communication_style: 'Verbose',
      emotional_baseline: 'Steady',
      interests: ['math'],
      patterns: ['iterates'],
      needs: ['structure'],
      evolution_notes: 'Note A',
      confidence_level: 0.8,
      last_updated: '2026-01-01T00:00:00.000Z',
    });

    // Ensure no extra fields leak through
    expect(Object.keys(result)).toHaveLength(9);
  });
});

describe('computeConfidence', () => {
  it('follows formula min(1.0, 0.2 + count * 0.02)', () => {
    expect(computeConfidence(0)).toBe(0.2);
    expect(computeConfidence(1)).toBe(0.22);
    expect(computeConfidence(10)).toBeCloseTo(0.4);
    expect(computeConfidence(20)).toBeCloseTo(0.6);
    expect(computeConfidence(30)).toBeCloseTo(0.8);
  });

  it('caps at 1.0', () => {
    expect(computeConfidence(40)).toBe(1.0);
    expect(computeConfidence(100)).toBe(1.0);
    expect(computeConfidence(1000)).toBe(1.0);
  });
});

describe('perception drift rate constants', () => {
  it('IDENTITY_DRIFT_RATE is 0.05', () => {
    expect(IDENTITY_DRIFT_RATE).toBe(0.05);
  });

  it('BEHAVIOR_DRIFT_RATE is 0.15', () => {
    expect(BEHAVIOR_DRIFT_RATE).toBe(0.15);
  });

  it('identity drifts slower than behavior', () => {
    expect(IDENTITY_DRIFT_RATE).toBeLessThan(BEHAVIOR_DRIFT_RATE);
  });
});
