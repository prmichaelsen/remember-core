/**
 * ImportService — bulk memory import with token-count chunking.
 *
 * Accepts one or more text items, splits each into ~3K token chunks,
 * creates memories via MemoryService, generates a parent summary via
 * HaikuClient, and links chunks to parent via RelationshipService.
 */

import type { Logger } from '../utils/logger.js';
import type { MemoryService, CreateMemoryResult } from './memory.service.js';
import type { RelationshipService } from './relationship.service.js';
import type { HaikuClient, HaikuExtraction } from './rem.haiku.js';

// ─── Input/Output Types ──────────────────────────────────────────────────

export interface ImportItem {
  /** Raw text content (mutually exclusive with file_url) */
  content?: string;
  /** Signed HTTPS URL for file-based import (mutually exclusive with content) */
  file_url?: string;
  /** MIME type of the file (required when file_url is provided) */
  mime_type?: string;
  /** Original filename, for metadata */
  source_filename?: string;
}

export interface ImportInput {
  /** One or more items to import */
  items: ImportItem[];
  /** Max tokens per chunk (default: 3000) */
  chunk_size?: number;
  /** Conversation that triggered the import */
  context_conversation_id?: string;
}

export interface ImportItemResult {
  /** UUID for this import item */
  import_id: string;
  /** Summary memory ID */
  parent_memory_id: string;
  /** Ordered chunk memory IDs */
  chunk_memory_ids: string[];
  /** Number of chunks created */
  chunk_count: number;
  /** Original filename if provided */
  source_filename?: string;
  /** Generated summary text */
  summary: string;
}

export interface ImportResult {
  /** Results per item */
  items: ImportItemResult[];
  /** Total memories created (parents + chunks) */
  total_memories_created: number;
}

// ─── Chunking Utility ────────────────────────────────────────────────────

/**
 * Estimate token count from text length.
 * Rough approximation: ~4 characters per token for English text.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split text into chunks of approximately maxTokensPerChunk tokens.
 * When text contains Markdown headings, prefers splitting on heading
 * boundaries (section-aware chunking). Falls back to paragraph splitting
 * within sections that exceed the token budget.
 *
 * Edge cases:
 * - Empty input → empty array
 * - Single paragraph exceeding budget → emitted as-is (oversized chunk)
 * - No paragraph breaks → falls back to character-count split
 */
export function chunkByTokens(text: string, maxTokensPerChunk: number): string[] {
  if (!text.trim()) return [];

  // Check if text contains Markdown headings for section-aware chunking
  const hasHeadings = /^#{1,3} /m.test(text);
  if (hasHeadings) {
    return chunkBySections(text, maxTokensPerChunk);
  }

  return chunkByParagraphs(text, maxTokensPerChunk);
}

/**
 * Section-aware chunking: split on Markdown heading boundaries first,
 * then fall back to paragraph splitting within oversized sections.
 */
function chunkBySections(text: string, maxTokensPerChunk: number): string[] {
  // Split on heading lines (# , ## , ### )
  const sections: string[] = [];
  const lines = text.split('\n');
  let currentSection = '';

  for (const line of lines) {
    if (/^#{1,3} /.test(line) && currentSection.trim()) {
      sections.push(currentSection);
      currentSection = '';
    }
    currentSection += line + '\n';
  }
  if (currentSection.trim()) {
    sections.push(currentSection);
  }

  // Now chunk sections, splitting oversized ones by paragraphs
  const chunks: string[] = [];
  let current = '';
  let currentTokens = 0;

  for (const section of sections) {
    const sectionTokens = estimateTokens(section);

    if (currentTokens + sectionTokens > maxTokensPerChunk && current) {
      chunks.push(current.trim());
      current = '';
      currentTokens = 0;
    }

    if (sectionTokens > maxTokensPerChunk) {
      // Section exceeds budget — fall back to paragraph splitting within it
      if (current.trim()) {
        chunks.push(current.trim());
        current = '';
        currentTokens = 0;
      }
      const subChunks = chunkByParagraphs(section, maxTokensPerChunk);
      chunks.push(...subChunks);
    } else {
      current += section + '\n';
      currentTokens += sectionTokens;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Paragraph-based chunking (original behavior).
 */
function chunkByParagraphs(text: string, maxTokensPerChunk: number): string[] {
  const maxChars = maxTokensPerChunk * 4;
  const paragraphs = text.split(/\n\n+/);

  // If there's only one paragraph and no splits possible, fall back to char split
  if (paragraphs.length === 1) {
    const trimmed = paragraphs[0].trim();
    if (estimateTokens(trimmed) <= maxTokensPerChunk) {
      return [trimmed];
    }
    // Fall back to character-count splitting
    return splitByChars(trimmed, maxChars);
  }

  const chunks: string[] = [];
  let current = '';
  let currentTokens = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (currentTokens + paraTokens > maxTokensPerChunk && current) {
      chunks.push(current.trim());
      current = '';
      currentTokens = 0;
    }

    current += para + '\n\n';
    currentTokens += paraTokens;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

/**
 * Fall-back character split for text with no paragraph breaks.
 */
function splitByChars(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    chunks.push(text.substring(i, i + maxChars).trim());
  }
  return chunks.filter(c => c.length > 0);
}

// ─── Service ─────────────────────────────────────────────────────────────

const DEFAULT_CHUNK_SIZE = 3000;
const HAIKU_SAMPLE_CHARS = 16000; // ~4K tokens for summary generation

export class ImportService {
  constructor(
    private memoryService: MemoryService,
    private relationshipService: RelationshipService,
    private haikuClient: HaikuClient,
    private logger: Logger,
  ) {}

  async import(input: ImportInput): Promise<ImportResult> {
    const chunkSize = input.chunk_size ?? DEFAULT_CHUNK_SIZE;
    const results: ImportItemResult[] = [];
    let totalCreated = 0;

    for (const item of input.items) {
      const result = await this.importItem(item, chunkSize, input.context_conversation_id);
      results.push(result);
      totalCreated += result.chunk_count + 1; // chunks + parent
    }

    this.logger.info('Import complete', {
      items: results.length,
      total_memories_created: totalCreated,
    });

    return {
      items: results,
      total_memories_created: totalCreated,
    };
  }

  private async importItem(
    item: ImportItem,
    chunkSize: number,
    contextConversationId?: string,
  ): Promise<ImportItemResult> {
    const importId = globalThis.crypto.randomUUID();
    const sourceLabel = item.source_filename || 'pasted text';
    const chunks = chunkByTokens(item.content ?? '', chunkSize);

    this.logger.info('Importing item', {
      import_id: importId,
      source: sourceLabel,
      chunk_count: chunks.length,
    });

    // 1. Create chunk memories
    const chunkMemoryIds: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const marker = `[CHUNK ${String(i + 1).padStart(5, '0')}]`;
      const result: CreateMemoryResult = await this.memoryService.create({
        content: `${marker}\n\n${chunks[i]}`,
        tags: [`import:${importId}`],
        context_summary: `Chunk ${i + 1} of ${chunks.length} from import`,
        context_conversation_id: contextConversationId,
      });
      chunkMemoryIds.push(result.memory_id);
    }

    // 2. Generate parent summary via HaikuClient
    const sample = (item.content ?? '').substring(0, HAIKU_SAMPLE_CHARS);
    let summaryText: string;

    try {
      const extraction: HaikuExtraction = await this.haikuClient.extractFeatures(sample);
      summaryText = extraction.summary || `Imported ${chunks.length} chunks from ${sourceLabel}`;
    } catch {
      this.logger.warn('HaikuClient extractFeatures failed, using default summary', {
        import_id: importId,
      });
      summaryText = `Imported ${chunks.length} chunks from ${sourceLabel}`;
    }

    // 3. Create parent summary memory
    const parentResult: CreateMemoryResult = await this.memoryService.create({
      content: summaryText,
      tags: [`import:${importId}`, 'import_summary'],
      context_summary: `Import of ${chunks.length} chunks from ${sourceLabel} (import ID: ${importId})`,
      context_conversation_id: contextConversationId,
    });

    // 4. Link chunks to parent via part_of relationships
    for (const chunkId of chunkMemoryIds) {
      await this.relationshipService.create({
        memory_ids: [parentResult.memory_id, chunkId],
        relationship_type: 'part_of',
        observation: `Chunk from import ${importId}`,
        source: 'rule',
        tags: [`import:${importId}`],
      });
    }

    return {
      import_id: importId,
      parent_memory_id: parentResult.memory_id,
      chunk_memory_ids: chunkMemoryIds,
      chunk_count: chunks.length,
      source_filename: item.source_filename,
      summary: summaryText,
    };
  }
}
