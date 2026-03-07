/**
 * MoodService — Firestore CRUD for core mood memory.
 *
 * The mood is NOT a Weaviate memory — it is a Firestore singleton
 * (structured numerical data, no semantic content to embed, frequent read/write).
 * Weaviate holds *what the ghost knows*; Firestore holds *what the ghost is*.
 *
 * Firestore path: {BASE}.users/{user_id}/{ghost_composite_id} (docId: 'core')
 *
 * See: agent/design/core-mood-memory.md
 */

import { getDocument, setDocument } from '../database/firestore/init.js';
import { BASE } from '../database/firestore/paths.js';

// ─── Types ───────────────────────────────────────────────────────────────

export interface MoodState {
  valence: number;        // -1 (miserable) to 1 (elated)
  arousal: number;        // 0 (calm) to 1 (activated)
  confidence: number;     // 0 (uncertain) to 1 (sure of itself)
  social_warmth: number;  // 0 (withdrawn) to 1 (seeking connection)
  coherence: number;      // 0 (confused/conflicted) to 1 (things make sense)
  trust: number;          // 0 (suspicious/guarded) to 1 (fully trusting)
}

export interface Pressure {
  source_memory_id: string;
  direction: string;      // e.g. "valence:-0.2"
  dimension: string;      // valence|arousal|confidence|social_warmth|coherence|trust
  magnitude: number;      // -1 to 1
  reason: string;
  created_at: string;     // ISO 8601
  decay_rate: number;     // 0-1
}

export interface MoodDerivation {
  dominant_emotion: string;
  color: string;
  reasoning: string;
}

export interface CoreMoodMemory {
  user_id: string;

  // Dimensional State
  state: MoodState;

  // Derived Labels (sub-LLM each REM cycle)
  color: string;
  dominant_emotion: string;
  reasoning: string;

  // Directional State
  motivation: string;
  goal: string;
  purpose: string;

  // Pressure Sources
  pressures: Pressure[];

  // Perception Fields
  personality_sketch: string;
  communication_style: string;
  emotional_baseline: string;
  interests: string[];
  patterns: string[];
  needs: string[];
  evolution_notes: string;
  confidence_level: number;

  // Metadata
  last_updated: string;
  rem_cycles_since_shift: number;
}

// ─── Defaults ────────────────────────────────────────────────────────────

export const NEUTRAL_STATE: MoodState = {
  valence: 0,
  arousal: 0.5,
  confidence: 0.5,
  social_warmth: 0.5,
  coherence: 0.5,
  trust: 0.5,
};

export function createInitialMood(userId: string): CoreMoodMemory {
  return {
    user_id: userId,
    state: { ...NEUTRAL_STATE },
    color: '',
    dominant_emotion: '',
    reasoning: '',
    motivation: '',
    goal: '',
    purpose: '',
    pressures: [],
    personality_sketch: '',
    communication_style: '',
    emotional_baseline: '',
    interests: [],
    patterns: [],
    needs: [],
    evolution_notes: '',
    confidence_level: 0,
    last_updated: new Date().toISOString(),
    rem_cycles_since_shift: 0,
  };
}

// ─── Firestore Path ──────────────────────────────────────────────────────

function getMoodPath(userId: string, ghostCompositeId: string): { collectionPath: string; docId: string } {
  return {
    collectionPath: `${BASE}.users/${userId}/${ghostCompositeId}`,
    docId: 'core',
  };
}

// ─── Service ─────────────────────────────────────────────────────────────

export class MoodService {
  /**
   * Read mood from Firestore. Returns null if not found.
   */
  async getMood(userId: string, ghostCompositeId: string): Promise<CoreMoodMemory | null> {
    const { collectionPath, docId } = getMoodPath(userId, ghostCompositeId);
    const doc = await getDocument(collectionPath, docId);
    if (!doc) return null;
    return doc as CoreMoodMemory;
  }

  /**
   * Initialize a new mood with neutral state defaults.
   */
  async initializeMood(userId: string, ghostCompositeId: string): Promise<CoreMoodMemory> {
    const mood = createInitialMood(userId);
    const { collectionPath, docId } = getMoodPath(userId, ghostCompositeId);
    await setDocument(collectionPath, docId, mood);
    return mood;
  }

  /**
   * Get existing mood or initialize if not found.
   */
  async getOrInitialize(userId: string, ghostCompositeId: string): Promise<CoreMoodMemory> {
    const existing = await this.getMood(userId, ghostCompositeId);
    if (existing) return existing;
    return this.initializeMood(userId, ghostCompositeId);
  }

  /**
   * Partial update of mood document. Sets last_updated automatically.
   */
  async updateMood(
    userId: string,
    ghostCompositeId: string,
    update: Partial<CoreMoodMemory>,
  ): Promise<void> {
    const { collectionPath, docId } = getMoodPath(userId, ghostCompositeId);
    await setDocument(collectionPath, docId, {
      ...update,
      last_updated: new Date().toISOString(),
    }, { mergeFields: [...Object.keys(update), 'last_updated'] });
  }

  /**
   * Append a single pressure to the pressures array.
   */
  async addPressure(userId: string, ghostCompositeId: string, pressure: Pressure): Promise<void> {
    const mood = await this.getOrInitialize(userId, ghostCompositeId);
    const pressures = [...mood.pressures, pressure];
    await this.updateMood(userId, ghostCompositeId, { pressures });
  }

  /**
   * Replace the full pressures array (used by REM after decay).
   */
  async setPressures(userId: string, ghostCompositeId: string, pressures: Pressure[]): Promise<void> {
    await this.updateMood(userId, ghostCompositeId, { pressures });
  }
}
