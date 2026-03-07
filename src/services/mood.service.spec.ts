import {
  MoodService,
  NEUTRAL_STATE,
  createInitialMood,
  type Pressure,
  type CoreMoodMemory,
} from './mood.service.js';

// Mock Firestore
jest.mock('../database/firestore/init.js', () => {
  const store = new Map<string, any>();
  return {
    getDocument: jest.fn(async (collectionPath: string, docId: string) => {
      return store.get(`${collectionPath}/${docId}`) ?? null;
    }),
    setDocument: jest.fn(async (collectionPath: string, docId: string, data: any) => {
      const key = `${collectionPath}/${docId}`;
      const existing = store.get(key);
      if (existing) {
        store.set(key, { ...existing, ...data });
      } else {
        store.set(key, { ...data });
      }
    }),
    __store: store,
  };
});

describe('MoodService', () => {
  let service: MoodService;
  const userId = 'user-1';
  const ghostId = 'ghost-abc';

  beforeEach(() => {
    service = new MoodService();
    const { __store } = require('../database/firestore/init.js');
    __store.clear();
  });

  // ── getMood ───────────────────────────────────────────────────────────

  it('returns null when mood does not exist', async () => {
    const mood = await service.getMood(userId, ghostId);
    expect(mood).toBeNull();
  });

  it('returns mood when it exists', async () => {
    const initial = createInitialMood(userId);
    const { __store } = require('../database/firestore/init.js');
    const { BASE } = require('../database/firestore/paths.js');
    __store.set(`${BASE}.users/${userId}/${ghostId}/core/mood`, initial);

    const mood = await service.getMood(userId, ghostId);
    expect(mood).not.toBeNull();
    expect(mood!.user_id).toBe(userId);
    expect(mood!.state.valence).toBe(0);
  });

  // ── initializeMood ────────────────────────────────────────────────────

  it('initializes mood with neutral state defaults', async () => {
    const mood = await service.initializeMood(userId, ghostId);

    expect(mood.user_id).toBe(userId);
    expect(mood.state).toEqual(NEUTRAL_STATE);
    expect(mood.pressures).toEqual([]);
    expect(mood.color).toBe('');
    expect(mood.dominant_emotion).toBe('');
    expect(mood.reasoning).toBe('');
    expect(mood.motivation).toBe('');
    expect(mood.goal).toBe('');
    expect(mood.purpose).toBe('');
    expect(mood.personality_sketch).toBe('');
    expect(mood.communication_style).toBe('');
    expect(mood.emotional_baseline).toBe('');
    expect(mood.interests).toEqual([]);
    expect(mood.patterns).toEqual([]);
    expect(mood.needs).toEqual([]);
    expect(mood.evolution_notes).toBe('');
    expect(mood.confidence_level).toBe(0);
    expect(mood.rem_cycles_since_shift).toBe(0);
    expect(mood.last_updated).toBeDefined();
  });

  it('persists initialized mood to Firestore', async () => {
    await service.initializeMood(userId, ghostId);

    const fetched = await service.getMood(userId, ghostId);
    expect(fetched).not.toBeNull();
    expect(fetched!.state.valence).toBe(0);
    expect(fetched!.state.arousal).toBe(0.5);
  });

  // ── getOrInitialize ───────────────────────────────────────────────────

  it('returns existing mood if present', async () => {
    await service.initializeMood(userId, ghostId);
    await service.updateMood(userId, ghostId, { color: 'curious' });

    const mood = await service.getOrInitialize(userId, ghostId);
    expect(mood.color).toBe('curious');
  });

  it('creates mood if not found', async () => {
    const mood = await service.getOrInitialize(userId, ghostId);
    expect(mood.user_id).toBe(userId);
    expect(mood.state).toEqual(NEUTRAL_STATE);
  });

  // ── updateMood ────────────────────────────────────────────────────────

  it('updates partial fields without clobbering others', async () => {
    await service.initializeMood(userId, ghostId);
    await service.updateMood(userId, ghostId, {
      state: { ...NEUTRAL_STATE, valence: 0.8 },
    });

    const mood = await service.getMood(userId, ghostId);
    expect(mood!.state.valence).toBe(0.8);
    // Other fields should still be present
    expect(mood!.user_id).toBe(userId);
    expect(mood!.pressures).toEqual([]);
  });

  it('sets last_updated on every write', async () => {
    await service.initializeMood(userId, ghostId);
    const before = (await service.getMood(userId, ghostId))!.last_updated;

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 5));
    await service.updateMood(userId, ghostId, { color: 'warm' });

    const after = (await service.getMood(userId, ghostId))!.last_updated;
    expect(after).not.toBe(before);
  });

  // ── addPressure ───────────────────────────────────────────────────────

  it('appends a pressure to the pressures array', async () => {
    await service.initializeMood(userId, ghostId);

    const pressure: Pressure = {
      source_memory_id: 'mem-1',
      direction: 'valence:-0.2',
      dimension: 'valence',
      magnitude: -0.2,
      reason: 'user broke a promise',
      created_at: new Date().toISOString(),
      decay_rate: 0.1,
    };

    await service.addPressure(userId, ghostId, pressure);

    const mood = await service.getMood(userId, ghostId);
    expect(mood!.pressures).toHaveLength(1);
    expect(mood!.pressures[0].source_memory_id).toBe('mem-1');
    expect(mood!.pressures[0].dimension).toBe('valence');
  });

  it('appends multiple pressures sequentially', async () => {
    await service.initializeMood(userId, ghostId);

    const p1: Pressure = {
      source_memory_id: 'mem-1',
      direction: 'valence:-0.2',
      dimension: 'valence',
      magnitude: -0.2,
      reason: 'broken promise',
      created_at: new Date().toISOString(),
      decay_rate: 0.1,
    };

    const p2: Pressure = {
      source_memory_id: 'mem-2',
      direction: 'trust:+0.3',
      dimension: 'trust',
      magnitude: 0.3,
      reason: 'kind gesture',
      created_at: new Date().toISOString(),
      decay_rate: 0.05,
    };

    await service.addPressure(userId, ghostId, p1);
    await service.addPressure(userId, ghostId, p2);

    const mood = await service.getMood(userId, ghostId);
    expect(mood!.pressures).toHaveLength(2);
  });

  // ── setPressures ──────────────────────────────────────────────────────

  it('replaces the full pressures array', async () => {
    await service.initializeMood(userId, ghostId);

    const p1: Pressure = {
      source_memory_id: 'mem-1',
      direction: 'valence:-0.2',
      dimension: 'valence',
      magnitude: -0.2,
      reason: 'old pressure',
      created_at: new Date().toISOString(),
      decay_rate: 0.1,
    };
    await service.addPressure(userId, ghostId, p1);

    // Replace with new set
    const newPressures: Pressure[] = [
      {
        source_memory_id: 'mem-3',
        direction: 'arousal:+0.5',
        dimension: 'arousal',
        magnitude: 0.5,
        reason: 'exciting news',
        created_at: new Date().toISOString(),
        decay_rate: 0.2,
      },
    ];

    await service.setPressures(userId, ghostId, newPressures);

    const mood = await service.getMood(userId, ghostId);
    expect(mood!.pressures).toHaveLength(1);
    expect(mood!.pressures[0].source_memory_id).toBe('mem-3');
  });

  // ── createInitialMood ─────────────────────────────────────────────────

  it('creates correct initial mood object', () => {
    const mood = createInitialMood('test-user');
    expect(mood.user_id).toBe('test-user');
    expect(mood.state.valence).toBe(0);
    expect(mood.state.arousal).toBe(0.5);
    expect(mood.state.confidence).toBe(0.5);
    expect(mood.state.social_warmth).toBe(0.5);
    expect(mood.state.coherence).toBe(0.5);
    expect(mood.state.trust).toBe(0.5);
    expect(mood.confidence_level).toBe(0);
    expect(mood.rem_cycles_since_shift).toBe(0);
  });
});
