/**
 * ClassificationService — Firestore-backed memory classification index.
 *
 * Provides CRUD for genres, quality signals, thematic groups, and merge candidates.
 * Classifications are per Weaviate collection — one Firestore document per collection.
 */

import { getDocument, setDocument, updateDocument } from '../database/firestore/init.js';
import { getClassificationPath } from '../database/firestore/paths.js';

// ─── Types ────────────────────────────────────────────────────────────────

export const GENRES = [
  'short_story',
  'standup_bit',
  'poem',
  'essay',
  'technical_note',
  'recipe',
  'journal_entry',
  'brainstorm',
  'conversation_summary',
  'code_snippet',
  'list',
  'letter',
  'review',
  'tutorial',
  'rant',
  'dream_log',
  'song_lyrics',
  'other',
] as const;

export type Genre = (typeof GENRES)[number];

export const QUALITY_SIGNALS = [
  'substantive',
  'draft',
  'low_value',
  'duplicate',
  'stale',
] as const;

export type QualitySignal = (typeof QUALITY_SIGNALS)[number];

export interface MergeCandidate {
  memory_id_a: string;
  memory_id_b: string;
  reason: string;
}

export interface ClassificationIndex {
  genres: Record<string, string[]>;
  thematic_groups: Record<string, string[]>;
  quality: Record<string, string[]>;
  merge_candidates: MergeCandidate[];
  last_updated: string;
  unclassified_count: number;
}

export interface ClassifyInput {
  genre?: Genre;
  qualities?: QualitySignal[];
  thematic_groups?: string[];
}

// ─── Validation ───────────────────────────────────────────────────────────

const GENRE_SET = new Set<string>(GENRES);
const QUALITY_SET = new Set<string>(QUALITY_SIGNALS);

function toSnakeCase(s: string): string {
  return s.replace(/[\s-]+/g, '_').toLowerCase();
}

// ─── Service ──────────────────────────────────────────────────────────────

export class ClassificationService {
  async getClassifications(collectionId: string): Promise<ClassificationIndex | null> {
    const { collectionPath, docId } = getClassificationPath(collectionId);
    const doc = await getDocument(collectionPath, docId);
    if (!doc) return null;
    return doc as unknown as ClassificationIndex;
  }

  async getByGenre(collectionId: string, genre: Genre): Promise<string[]> {
    const index = await this.getClassifications(collectionId);
    if (!index) return [];
    return index.genres[genre] ?? [];
  }

  async getByQuality(collectionId: string, quality: QualitySignal): Promise<string[]> {
    const index = await this.getClassifications(collectionId);
    if (!index) return [];
    return index.quality[quality] ?? [];
  }

  async getByThematicGroup(collectionId: string, group: string): Promise<string[]> {
    const index = await this.getClassifications(collectionId);
    if (!index) return [];
    return index.thematic_groups[toSnakeCase(group)] ?? [];
  }

  async getUnclassifiedCount(collectionId: string): Promise<number> {
    const index = await this.getClassifications(collectionId);
    if (!index) return 0;
    return index.unclassified_count;
  }

  async getMergeCandidates(collectionId: string): Promise<MergeCandidate[]> {
    const index = await this.getClassifications(collectionId);
    if (!index) return [];
    return index.merge_candidates ?? [];
  }

  async classify(collectionId: string, memoryId: string, input: ClassifyInput): Promise<void> {
    if (input.genre && !GENRE_SET.has(input.genre)) {
      throw new Error(`Invalid genre: ${input.genre}`);
    }
    if (input.qualities) {
      for (const q of input.qualities) {
        if (!QUALITY_SET.has(q)) throw new Error(`Invalid quality signal: ${q}`);
      }
    }

    const index = await this.getOrInitialize(collectionId);

    // Add to genre
    if (input.genre) {
      if (!index.genres[input.genre]) index.genres[input.genre] = [];
      if (!index.genres[input.genre].includes(memoryId)) {
        index.genres[input.genre].push(memoryId);
      }
    }

    // Add to quality signals (multiple allowed)
    if (input.qualities) {
      for (const q of input.qualities) {
        if (!index.quality[q]) index.quality[q] = [];
        if (!index.quality[q].includes(memoryId)) {
          index.quality[q].push(memoryId);
        }
      }
    }

    // Add to thematic groups (multiple allowed, snake_case normalized)
    if (input.thematic_groups) {
      for (const rawGroup of input.thematic_groups) {
        const group = toSnakeCase(rawGroup);
        if (!index.thematic_groups[group]) index.thematic_groups[group] = [];
        if (!index.thematic_groups[group].includes(memoryId)) {
          index.thematic_groups[group].push(memoryId);
        }
      }
    }

    index.last_updated = new Date().toISOString();

    const { collectionPath, docId } = getClassificationPath(collectionId);
    await setDocument(collectionPath, docId, index as any);
  }

  async addMergeCandidate(
    collectionId: string,
    candidate: MergeCandidate,
  ): Promise<void> {
    const index = await this.getOrInitialize(collectionId);

    // Check for duplicate candidate (either direction)
    const exists = index.merge_candidates.some(
      (mc) =>
        (mc.memory_id_a === candidate.memory_id_a && mc.memory_id_b === candidate.memory_id_b) ||
        (mc.memory_id_a === candidate.memory_id_b && mc.memory_id_b === candidate.memory_id_a),
    );
    if (!exists) {
      index.merge_candidates.push(candidate);
    }

    index.last_updated = new Date().toISOString();

    const { collectionPath, docId } = getClassificationPath(collectionId);
    await setDocument(collectionPath, docId, index as any);
  }

  async removeFromIndex(collectionId: string, memoryId: string): Promise<void> {
    const index = await this.getClassifications(collectionId);
    if (!index) return;

    // Remove from genres
    for (const genre of Object.keys(index.genres)) {
      index.genres[genre] = index.genres[genre].filter((id) => id !== memoryId);
    }

    // Remove from quality
    for (const quality of Object.keys(index.quality)) {
      index.quality[quality] = index.quality[quality].filter((id) => id !== memoryId);
    }

    // Remove from thematic groups
    for (const group of Object.keys(index.thematic_groups)) {
      index.thematic_groups[group] = index.thematic_groups[group].filter((id) => id !== memoryId);
    }

    // Remove from merge candidates
    index.merge_candidates = index.merge_candidates.filter(
      (mc) => mc.memory_id_a !== memoryId && mc.memory_id_b !== memoryId,
    );

    index.last_updated = new Date().toISOString();

    const { collectionPath, docId } = getClassificationPath(collectionId);
    await setDocument(collectionPath, docId, index as any);
  }

  async initializeIndex(collectionId: string): Promise<ClassificationIndex> {
    const index: ClassificationIndex = {
      genres: {},
      thematic_groups: {},
      quality: {},
      merge_candidates: [],
      last_updated: new Date().toISOString(),
      unclassified_count: 0,
    };

    const { collectionPath, docId } = getClassificationPath(collectionId);
    await setDocument(collectionPath, docId, index as any);
    return index;
  }

  async getOrInitialize(collectionId: string): Promise<ClassificationIndex> {
    const existing = await this.getClassifications(collectionId);
    if (existing) return existing;
    return this.initializeIndex(collectionId);
  }

  async setUnclassifiedCount(collectionId: string, count: number): Promise<void> {
    const { collectionPath, docId } = getClassificationPath(collectionId);
    await updateDocument(collectionPath, docId, {
      unclassified_count: count,
      last_updated: new Date().toISOString(),
    } as any);
  }
}
