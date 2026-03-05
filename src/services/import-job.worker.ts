/**
 * ImportJobWorker — executes bulk imports as tracked job steps.
 *
 * Refactored from ImportService to be job-native: each chunk is a step
 * with individual success/failure tracking, cancellation support, and
 * progress reporting through JobService.
 */

import type { Logger } from '../utils/logger.js';
import type { JobService } from './job.service.js';
import type { MemoryService, CreateMemoryResult } from './memory.service.js';
import type { RelationshipService } from './relationship.service.js';
import type { HaikuClient, HaikuExtraction } from './rem.haiku.js';
import type { ImportItem, ImportItemResult } from './import.service.js';
import { chunkByTokens } from './import.service.js';
import type { ExtractorRegistry } from './extractors/index.js';
import { downloadFile } from './extractors/index.js';

// ─── Types ──────────────────────────────────────────────────────────────

export interface ImportJobParams {
  items: ImportItem[];
  chunk_size?: number;
  context_conversation_id?: string;
}

interface ChunkEntry {
  itemIndex: number;
  chunkIndex: number;
  chunk: string;
  item: ImportItem;
}

// ─── Constants ──────────────────────────────────────────────────────────

const DEFAULT_CHUNK_SIZE = 3000;
const HAIKU_SAMPLE_CHARS = 16000;

// ─── Worker ─────────────────────────────────────────────────────────────

export class ImportJobWorker {
  constructor(
    private jobService: JobService,
    private memoryService: MemoryService,
    private relationshipService: RelationshipService,
    private haikuClient: HaikuClient,
    private logger: Logger,
    private extractorRegistry?: ExtractorRegistry,
  ) {}

  async execute(jobId: string, userId: string, params: ImportJobParams): Promise<void> {
    const chunkSize = params.chunk_size ?? DEFAULT_CHUNK_SIZE;

    // 0. Extract file content for file-based items
    for (const item of params.items) {
      if (item.file_url && item.mime_type) {
        try {
          const extractor = this.extractorRegistry?.getExtractor(item.mime_type);
          if (!extractor) {
            await this.jobService.complete(jobId, {
              status: 'failed',
              error: { code: 'unsupported_format', message: `Unsupported file type: ${item.mime_type}` },
            });
            return;
          }

          this.logger.info('Downloading file', { job_id: jobId, mime_type: item.mime_type });
          const buffer = await downloadFile(item.file_url);

          this.logger.info('Extracting text', { job_id: jobId, mime_type: item.mime_type });
          const result = await extractor.extract(buffer, item.mime_type);

          item.content = result.text;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn('Extraction failed', { job_id: jobId, error: message });
          await this.jobService.complete(jobId, {
            status: 'failed',
            error: { code: 'extraction_failed', message },
          });
          return;
        }
      }
    }

    // 1. Chunk all items, flatten into ordered step list
    const allChunks: ChunkEntry[] = params.items.flatMap((item, i) => {
      const chunks = chunkByTokens(item.content ?? '', chunkSize);
      return chunks.map((chunk, j) => ({ itemIndex: i, chunkIndex: j, chunk, item }));
    });

    // Handle empty items
    if (allChunks.length === 0) {
      await this.jobService.complete(jobId, {
        status: 'completed',
        result: { items: [], total_memories_created: 0 },
      });
      return;
    }

    // 2. Register all steps upfront
    for (let i = 0; i < allChunks.length; i++) {
      await this.jobService.addStep(jobId, {
        id: `chunk-${i}`,
        label: `Processing chunk ${i + 1} of ${allChunks.length}`,
        status: 'pending',
        started_at: null,
        completed_at: null,
        error: null,
      });
    }

    // 3. Process each chunk as a step
    // Track per-item data for parent summary generation
    const itemData = new Map<number, {
      importId: string;
      chunkMemoryIds: string[];
      item: ImportItem;
    }>();

    // Initialize per-item tracking
    for (let i = 0; i < params.items.length; i++) {
      itemData.set(i, {
        importId: globalThis.crypto.randomUUID(),
        chunkMemoryIds: [],
        item: params.items[i],
      });
    }

    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < allChunks.length; i++) {
      const entry = allChunks[i];

      // Check cancellation between steps
      if (await this.jobService.isCancelled(jobId)) {
        await this.jobService.complete(jobId, {
          status: 'cancelled',
          result: { processed: i, total: allChunks.length },
        });
        return;
      }

      // Mark step running
      await this.jobService.updateStep(jobId, `chunk-${i}`, {
        status: 'running',
        started_at: new Date().toISOString(),
      });

      try {
        const data = itemData.get(entry.itemIndex)!;
        const marker = `[CHUNK ${String(entry.chunkIndex + 1).padStart(5, '0')}]`;

        const result: CreateMemoryResult = await this.memoryService.create({
          content: `${marker}\n\n${entry.chunk}`,
          tags: [`import:${data.importId}`],
          context_summary: `Chunk ${entry.chunkIndex + 1} from import`,
          context_conversation_id: params.context_conversation_id,
        });

        data.chunkMemoryIds.push(result.memory_id);

        // Mark step completed
        await this.jobService.updateStep(jobId, `chunk-${i}`, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
        succeeded++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.jobService.updateStep(jobId, `chunk-${i}`, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: { code: 'chunk_failed', message, step_id: `chunk-${i}` },
        });
        failed++;
        this.logger.warn('Chunk failed', { job_id: jobId, step: `chunk-${i}`, error: message });
      }

      // Update overall progress
      await this.jobService.updateProgress(jobId, {
        progress: Math.round(((i + 1) / allChunks.length) * 100),
        current_step: `Processing chunk ${i + 1} of ${allChunks.length}`,
      });
    }

    // 4. Generate parent summaries + relationships (per item)
    const results: ImportItemResult[] = [];

    for (const [, data] of itemData) {
      if (data.chunkMemoryIds.length === 0) continue;

      const sourceLabel = data.item.source_filename || 'pasted text';

      // Generate summary
      let summaryText: string;
      try {
        const sample = (data.item.content ?? '').substring(0, HAIKU_SAMPLE_CHARS);
        const extraction: HaikuExtraction = await this.haikuClient.extractFeatures(sample);
        summaryText = extraction.summary || `Imported ${data.chunkMemoryIds.length} chunks from ${sourceLabel}`;
      } catch {
        this.logger.warn('HaikuClient extractFeatures failed, using default summary', {
          import_id: data.importId,
        });
        summaryText = `Imported ${data.chunkMemoryIds.length} chunks from ${sourceLabel}`;
      }

      // Create parent summary memory
      const parentContent =
        `Import summary: ${summaryText}\n` +
        `Source: ${sourceLabel}\n` +
        `Chunks: ${data.chunkMemoryIds.length}\n` +
        `Import ID: ${data.importId}`;

      const parentResult: CreateMemoryResult = await this.memoryService.create({
        content: parentContent,
        tags: [`import:${data.importId}`, 'import_summary'],
        context_summary: `Import summary for ${sourceLabel}`,
        context_conversation_id: params.context_conversation_id,
      });

      // Link chunks to parent
      for (const chunkId of data.chunkMemoryIds) {
        await this.relationshipService.create({
          memory_ids: [parentResult.memory_id, chunkId],
          relationship_type: 'part_of',
          observation: `Chunk from import ${data.importId}`,
          source: 'rule',
          tags: [`import:${data.importId}`],
        });
      }

      results.push({
        import_id: data.importId,
        parent_memory_id: parentResult.memory_id,
        chunk_memory_ids: data.chunkMemoryIds,
        chunk_count: data.chunkMemoryIds.length,
        source_filename: data.item.source_filename,
        summary: summaryText,
      });
    }

    // 5. Complete job
    const totalCreated = results.reduce((sum, r) => sum + r.chunk_count + 1, 0);
    const status = failed > 0
      ? (succeeded === 0 ? 'failed' : 'completed_with_errors')
      : 'completed';

    await this.jobService.complete(jobId, {
      status,
      result: { items: results, total_memories_created: totalCreated, failed },
      ...(failed > 0 ? {
        error: { code: 'partial_failure', message: `${failed} chunk(s) failed` },
      } : {}),
    });

    this.logger.info('Import job complete', {
      job_id: jobId,
      status,
      succeeded,
      failed,
      total_memories_created: totalCreated,
    });
  }
}
