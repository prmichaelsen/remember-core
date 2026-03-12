import { ImportJobWorker } from '../import-job.worker.js';
import type { JobService } from '../job.service.js';
import type { MemoryService } from '../memory.service.js';
import type { RelationshipService } from '../relationship.service.js';
import type { HaikuClient } from '../rem.haiku.js';
import type { Logger } from '../../utils/logger.js';
import { ExtractorRegistry } from './registry.js';
import type { FileExtractor, ExtractionResult } from './types.js';

// Mock downloadFile
jest.mock('./download.js', () => ({
  downloadFile: jest.fn(),
}));

import { downloadFile } from './download.js';
const mockDownload = jest.mocked(downloadFile);

function createMockJobService() {
  return {
    addStep: jest.fn(),
    updateStep: jest.fn(),
    updateProgress: jest.fn(),
    complete: jest.fn(),
    isCancelled: jest.fn().mockResolvedValue(false),
  } as unknown as JobService;
}

function createMockMemoryService() {
  let counter = 0;
  return {
    create: jest.fn().mockImplementation(() => {
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
    create: jest.fn().mockResolvedValue({
      relationship_id: 'rel-1',
      memory_ids: [],
      created_at: new Date().toISOString(),
    }),
  } as unknown as RelationshipService;
}

function createMockHaikuClient(): HaikuClient {
  return {
    validateCluster: jest.fn(),
    evaluateCluster: jest.fn().mockResolvedValue({ confidence: 0.8, relationship_type: 'topical', observation: 'mock', strength: 0.7, tags: [], reasoning: 'mock' }),
    extractFeatures: jest.fn().mockResolvedValue({
      keywords: ['test'],
      topics: ['testing'],
      themes: ['verification'],
      summary: 'Test summary.',
    }),
  };
}

function createMockLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
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
    jest.resetAllMocks();
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
      extract: jest.fn().mockResolvedValue({
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
    expect(jest.mocked(jobService.complete)).toHaveBeenCalledWith(
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

    expect(jest.mocked(jobService.complete)).toHaveBeenCalledWith('job-1', {
      status: 'failed',
      error: { code: 'unsupported_format', message: 'Unsupported file type: application/xyz' },
    });
  });

  it('fails job when download fails', async () => {
    const mockExtractor: FileExtractor = {
      supportedMimeTypes: ['application/pdf'],
      extract: jest.fn(),
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

    expect(jest.mocked(jobService.complete)).toHaveBeenCalledWith('job-1', {
      status: 'failed',
      error: { code: 'extraction_failed', message: 'Download failed: 403 Forbidden' },
    });
  });

  it('fails job when extraction throws', async () => {
    const mockExtractor: FileExtractor = {
      supportedMimeTypes: ['application/pdf'],
      extract: jest.fn().mockRejectedValue(new Error('Corrupt PDF')),
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

    expect(jest.mocked(jobService.complete)).toHaveBeenCalledWith('job-1', {
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
    expect(jest.mocked(jobService.complete)).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ status: 'completed' }),
    );
  });
});
