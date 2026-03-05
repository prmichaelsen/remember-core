import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportJobWorker } from '../import-job.worker.js';
import type { JobService } from '../job.service.js';
import type { MemoryService } from '../memory.service.js';
import type { RelationshipService } from '../relationship.service.js';
import type { HaikuClient } from '../rem.haiku.js';
import type { Logger } from '../../utils/logger.js';
import { ExtractorRegistry } from './registry.js';
import type { FileExtractor, ExtractionResult } from './types.js';

// Mock downloadFile
vi.mock('./download.js', () => ({
  downloadFile: vi.fn(),
}));

import { downloadFile } from './download.js';
const mockDownload = vi.mocked(downloadFile);

function createMockJobService() {
  return {
    addStep: vi.fn(),
    updateStep: vi.fn(),
    updateProgress: vi.fn(),
    complete: vi.fn(),
    isCancelled: vi.fn().mockResolvedValue(false),
  } as unknown as JobService;
}

function createMockMemoryService() {
  let counter = 0;
  return {
    create: vi.fn().mockImplementation(() => {
      counter++;
      return Promise.resolve({
        memory_id: `mem-${counter}`,
        created_at: new Date().toISOString(),
      });
    }),
  } as unknown as MemoryService;
}

function createMockRelationshipService() {
  return {
    create: vi.fn().mockResolvedValue({
      relationship_id: 'rel-1',
      memory_ids: [],
      created_at: new Date().toISOString(),
    }),
  } as unknown as RelationshipService;
}

function createMockHaikuClient(): HaikuClient {
  return {
    validateCluster: vi.fn(),
    extractFeatures: vi.fn().mockResolvedValue({
      keywords: ['test'],
      topics: ['testing'],
      themes: ['verification'],
      summary: 'Test summary.',
    }),
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe('ImportJobWorker file extraction', () => {
  let jobService: JobService;
  let memoryService: MemoryService;
  let relationshipService: RelationshipService;
  let haikuClient: HaikuClient;
  let logger: Logger;
  let registry: ExtractorRegistry;

  beforeEach(() => {
    vi.resetAllMocks();
    jobService = createMockJobService();
    memoryService = createMockMemoryService();
    relationshipService = createMockRelationshipService();
    haikuClient = createMockHaikuClient();
    logger = createMockLogger();
    registry = new ExtractorRegistry();
  });

  it('extracts text from file_url before chunking', async () => {
    const mockExtractor: FileExtractor = {
      supportedMimeTypes: ['application/pdf'],
      extract: vi.fn().mockResolvedValue({
        text: 'Extracted PDF text content',
        metadata: { title: 'Test' },
      } as ExtractionResult),
    };
    registry.register(mockExtractor);
    mockDownload.mockResolvedValue(Buffer.from('fake-pdf-bytes'));

    const worker = new ImportJobWorker(
      jobService, memoryService, relationshipService,
      haikuClient, logger, registry,
    );

    await worker.execute('job-1', 'user-1', {
      items: [{ file_url: 'https://example.com/doc.pdf', mime_type: 'application/pdf' }],
    });

    expect(mockDownload).toHaveBeenCalledWith('https://example.com/doc.pdf');
    expect(mockExtractor.extract).toHaveBeenCalledWith(
      Buffer.from('fake-pdf-bytes'),
      'application/pdf',
    );
    // Job should complete successfully
    expect(vi.mocked(jobService.complete)).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'completed' }),
    );
  });

  it('fails job when MIME type is unsupported', async () => {
    const worker = new ImportJobWorker(
      jobService, memoryService, relationshipService,
      haikuClient, logger, registry,
    );

    await worker.execute('job-1', 'user-1', {
      items: [{ file_url: 'https://example.com/file.xyz', mime_type: 'application/xyz' }],
    });

    expect(vi.mocked(jobService.complete)).toHaveBeenCalledWith('job-1', {
      status: 'failed',
      error: { code: 'unsupported_format', message: 'Unsupported file type: application/xyz' },
    });
  });

  it('fails job when download fails', async () => {
    const mockExtractor: FileExtractor = {
      supportedMimeTypes: ['application/pdf'],
      extract: vi.fn(),
    };
    registry.register(mockExtractor);
    mockDownload.mockRejectedValue(new Error('Download failed: 403 Forbidden'));

    const worker = new ImportJobWorker(
      jobService, memoryService, relationshipService,
      haikuClient, logger, registry,
    );

    await worker.execute('job-1', 'user-1', {
      items: [{ file_url: 'https://example.com/doc.pdf', mime_type: 'application/pdf' }],
    });

    expect(vi.mocked(jobService.complete)).toHaveBeenCalledWith('job-1', {
      status: 'failed',
      error: { code: 'extraction_failed', message: 'Download failed: 403 Forbidden' },
    });
  });

  it('fails job when extraction throws', async () => {
    const mockExtractor: FileExtractor = {
      supportedMimeTypes: ['application/pdf'],
      extract: vi.fn().mockRejectedValue(new Error('Corrupt PDF')),
    };
    registry.register(mockExtractor);
    mockDownload.mockResolvedValue(Buffer.from('bad-pdf'));

    const worker = new ImportJobWorker(
      jobService, memoryService, relationshipService,
      haikuClient, logger, registry,
    );

    await worker.execute('job-1', 'user-1', {
      items: [{ file_url: 'https://example.com/doc.pdf', mime_type: 'application/pdf' }],
    });

    expect(vi.mocked(jobService.complete)).toHaveBeenCalledWith('job-1', {
      status: 'failed',
      error: { code: 'extraction_failed', message: 'Corrupt PDF' },
    });
  });

  it('text-only items still work (backward compatible)', async () => {
    const worker = new ImportJobWorker(
      jobService, memoryService, relationshipService,
      haikuClient, logger, registry,
    );

    await worker.execute('job-1', 'user-1', {
      items: [{ content: 'Plain text content' }],
    });

    expect(mockDownload).not.toHaveBeenCalled();
    expect(vi.mocked(jobService.complete)).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'completed' }),
    );
  });
});
