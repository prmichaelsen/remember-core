import { ImportJobWorker } from '../import-job.worker.js';
import type { JobService } from '../job.service.js';
import type { MemoryService } from '../memory.service.js';
import type { RelationshipService } from '../relationship.service.js';
import type { HaikuClient } from '../rem.haiku.js';
import type { Logger } from '../../utils/logger.js';
import { ExtractorRegistry } from './registry.js';
import type { FileExtractor, ExtractionResult } from './types.js';
import { chunkByTokens } from '../import.service.js';

// Mock downloadFile
jest.mock('./download.js', () => ({
  downloadFile: jest.fn(),
}));

import { downloadFile } from './download.js';
const mockDownload = jest.mocked(downloadFile);

function createMocks() {
  let memCounter = 0;
  return {
    jobService: {
      addStep: jest.fn(),
      updateStep: jest.fn(),
      updateProgress: jest.fn(),
      complete: jest.fn(),
      isCancelled: jest.fn().mockResolvedValue(false),
    } as unknown as JobService,
    memoryService: {
      create: jest.fn().mockImplementation(() => {
        memCounter++;
        return Promise.resolve({
          memory_id: `mem-${memCounter}`,
          created_at: new Date().toISOString(),
        });
      }),
    } as unknown as MemoryService,
    relationshipService: {
      create: jest.fn().mockResolvedValue({
        relationship_id: 'rel-1',
        memory_ids: [],
        created_at: new Date().toISOString(),
      }),
    } as unknown as RelationshipService,
    haikuClient: {
      validateCluster: jest.fn(),
      evaluateCluster: jest.fn().mockResolvedValue({ confidence: 0.8, relationship_type: 'topical', observation: 'mock', strength: 0.7, tags: [], reasoning: 'mock' }),
      extractFeatures: jest.fn().mockResolvedValue({
        keywords: [],
        topics: [],
        themes: [],
        summary: 'Test summary.',
      }),
    } as HaikuClient,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as Logger,
  };
}

describe('source:file_import tagging', () => {
  it('adds source:file_import tag to file-imported memories', async () => {
    const mocks = createMocks();
    const registry = new ExtractorRegistry();
    registry.register({
      supportedMimeTypes: ['application/pdf'],
      extract: jest.fn().mockResolvedValue({
        text: 'Extracted text',
        metadata: {},
      } as ExtractionResult),
    } as FileExtractor);
    mockDownload.mockResolvedValue(Buffer.from('pdf'));

    const worker = new ImportJobWorker(
      mocks.jobService, mocks.memoryService, mocks.relationshipService,
      mocks.haikuClient, mocks.logger, registry,
    );

    await worker.execute('job-1', 'user-1', {
      items: [{ file_url: 'https://example.com/doc.pdf', mime_type: 'application/pdf' }],
    });

    const createCalls = jest.mocked(mocks.memoryService.create).mock.calls;
    // Both chunk and parent should have source:file_import
    for (const call of createCalls) {
      expect((call[0] as any).tags).toContain('source:file_import');
    }
  });

  it('does NOT add source:file_import tag to text-only imports', async () => {
    const mocks = createMocks();
    const worker = new ImportJobWorker(
      mocks.jobService, mocks.memoryService, mocks.relationshipService,
      mocks.haikuClient, mocks.logger,
    );

    await worker.execute('job-1', 'user-1', {
      items: [{ content: 'Plain text' }],
    });

    const createCalls = jest.mocked(mocks.memoryService.create).mock.calls;
    for (const call of createCalls) {
      expect((call[0] as any).tags).not.toContain('source:file_import');
    }
  });
});

describe('document metadata tags on parent summary', () => {
  it('adds doc:title, doc:author, doc:pages tags', async () => {
    const mocks = createMocks();
    const registry = new ExtractorRegistry();
    registry.register({
      supportedMimeTypes: ['application/pdf'],
      extract: jest.fn().mockResolvedValue({
        text: 'Extracted text content',
        metadata: { title: 'My Doc', author: 'Alice', pages: '5' },
      } as ExtractionResult),
    } as FileExtractor);
    mockDownload.mockResolvedValue(Buffer.from('pdf'));

    const worker = new ImportJobWorker(
      mocks.jobService, mocks.memoryService, mocks.relationshipService,
      mocks.haikuClient, mocks.logger, registry,
    );

    await worker.execute('job-1', 'user-1', {
      items: [{ file_url: 'https://example.com/doc.pdf', mime_type: 'application/pdf' }],
    });

    const createCalls = jest.mocked(mocks.memoryService.create).mock.calls;
    // Last create call should be the parent summary
    const parentCall = createCalls[createCalls.length - 1][0] as any;
    expect(parentCall.tags).toContain('doc:title:My Doc');
    expect(parentCall.tags).toContain('doc:author:Alice');
    expect(parentCall.tags).toContain('doc:pages:5');
  });
});

describe('section-aware chunking', () => {
  it('splits on heading boundaries', () => {
    const text = '# Section 1\n\nContent one.\n\n# Section 2\n\nContent two.';
    // Each section is ~25 chars = ~7 tokens. Budget of 8 fits one section.
    const chunks = chunkByTokens(text, 8);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toContain('# Section 1');
    expect(chunks[1]).toContain('# Section 2');
  });

  it('falls back to paragraph splitting for oversized sections', () => {
    const longContent = 'a'.repeat(200) + '\n\n' + 'b'.repeat(200);
    const text = `# Big Section\n\n${longContent}`;
    const chunks = chunkByTokens(text, 30);
    // Should split the oversized section by paragraphs
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('does not use section-aware chunking without headings', () => {
    const text = 'Para 1.\n\nPara 2.\n\nPara 3.';
    const chunks = chunkByTokens(text, 5);
    // Should use paragraph splitting
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('handles h2 and h3 headings', () => {
    const text = '## Section A\n\nContent A.\n\n### Sub B\n\nContent B.';
    // Each section ~25 chars = ~7 tokens. Budget of 8 fits one section.
    const chunks = chunkByTokens(text, 8);
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toContain('## Section A');
    expect(chunks[1]).toContain('### Sub B');
  });

  it('combines small sections into one chunk', () => {
    const text = '# A\n\nSmall.\n\n# B\n\nSmall too.';
    const chunks = chunkByTokens(text, 100);
    // Both sections fit in one chunk
    expect(chunks.length).toBe(1);
  });
});
