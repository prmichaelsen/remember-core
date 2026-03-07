/**
 * PerceptionService — thin wrapper around MoodService for user perception fields.
 *
 * Reads and writes the perception-related flat fields on CoreMoodMemory
 * (personality_sketch, communication_style, etc.) via the MoodService.
 */

import type { CoreMoodMemory } from './mood.service.js';
import type { MoodService } from './mood.service.js';

// ─── Types ───────────────────────────────────────────────────────────────

export interface UserPerception {
  personality_sketch: string;
  communication_style: string;
  emotional_baseline: string;
  interests: string[];
  patterns: string[];
  needs: string[];
  evolution_notes: string;
  confidence_level: number;
  last_updated: string;
}

// ─── Defaults ────────────────────────────────────────────────────────────

export const INITIAL_PERCEPTION: UserPerception = {
  personality_sketch: '',
  communication_style: '',
  emotional_baseline: '',
  interests: [],
  patterns: [],
  needs: [],
  evolution_notes: '',
  confidence_level: 0.2,
  last_updated: new Date().toISOString(),
};

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Extract perception fields from a CoreMoodMemory document.
 */
export function extractPerception(mood: CoreMoodMemory): UserPerception {
  return {
    personality_sketch: mood.personality_sketch,
    communication_style: mood.communication_style,
    emotional_baseline: mood.emotional_baseline,
    interests: mood.interests,
    patterns: mood.patterns,
    needs: mood.needs,
    evolution_notes: mood.evolution_notes,
    confidence_level: mood.confidence_level,
    last_updated: mood.last_updated,
  };
}

/**
 * Compute confidence from interaction count: min(1.0, 0.2 + count * 0.02).
 */
export function computeConfidence(interactionCount: number): number {
  return Math.min(1.0, 0.2 + interactionCount * 0.02);
}

// ─── Service ─────────────────────────────────────────────────────────────

export interface PerceptionServiceDeps {
  moodService: MoodService;
}

export class PerceptionService {
  constructor(private deps: PerceptionServiceDeps) {}

  /**
   * Read perception fields from CoreMoodMemory via MoodService.
   * Returns null if no mood document exists.
   */
  async getPerception(userId: string, ghostCompositeId: string): Promise<UserPerception | null> {
    const mood = await this.deps.moodService.getMood(userId, ghostCompositeId);
    if (!mood) return null;
    return extractPerception(mood);
  }

  /**
   * Write INITIAL_PERCEPTION defaults into CoreMoodMemory via MoodService.updateMood().
   * Returns the initial perception.
   */
  async initializePerception(userId: string, ghostCompositeId: string): Promise<UserPerception> {
    const perception: UserPerception = {
      ...INITIAL_PERCEPTION,
      last_updated: new Date().toISOString(),
    };
    await this.deps.moodService.updateMood(userId, ghostCompositeId, perception);
    return perception;
  }

  /**
   * Get existing perception or initialize if not found.
   */
  async getOrInitialize(userId: string, ghostCompositeId: string): Promise<UserPerception> {
    const existing = await this.getPerception(userId, ghostCompositeId);
    if (existing) return existing;
    return this.initializePerception(userId, ghostCompositeId);
  }

  /**
   * Partial update of perception fields via MoodService.updateMood().
   * Always sets last_updated.
   */
  async updatePerception(
    userId: string,
    ghostCompositeId: string,
    update: Partial<UserPerception>,
  ): Promise<void> {
    await this.deps.moodService.updateMood(userId, ghostCompositeId, {
      ...update,
      last_updated: new Date().toISOString(),
    });
  }

  /**
   * Append to evolution_notes string (separated by newlines).
   * Reads current value, appends, writes back.
   */
  async appendEvolutionNote(userId: string, ghostCompositeId: string, note: string): Promise<void> {
    const mood = await this.deps.moodService.getOrInitialize(userId, ghostCompositeId);
    const current = mood.evolution_notes;
    const updated = current ? `${current}\n${note}` : note;
    await this.deps.moodService.updateMood(userId, ghostCompositeId, {
      evolution_notes: updated,
    });
  }

  /**
   * Adjust confidence_level by delta, clamped to [0, 1].
   */
  async adjustConfidence(userId: string, ghostCompositeId: string, delta: number): Promise<void> {
    const mood = await this.deps.moodService.getOrInitialize(userId, ghostCompositeId);
    const clamped = Math.max(0, Math.min(1, mood.confidence_level + delta));
    await this.deps.moodService.updateMood(userId, ghostCompositeId, {
      confidence_level: clamped,
    });
  }
}
