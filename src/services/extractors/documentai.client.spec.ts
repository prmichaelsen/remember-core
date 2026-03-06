const mockProcessDocument = jest.fn();

jest.mock('@google-cloud/documentai', () => ({
  DocumentProcessorServiceClient: jest.fn().mockImplementation(() => ({
    processDocument: mockProcessDocument,
  })),
}), { virtual: true });

import { createDocumentAiClient } from './documentai.client.js';

describe('createDocumentAiClient', () => {
  const config = {
    serviceAccountKey: JSON.stringify({ project_id: 'test-project' }),
    processorId: 'proc-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call processDocument with base64 content', async () => {
    mockProcessDocument.mockResolvedValue([{
      document: {
        text: 'Extracted text',
        pages: [
          { layout: { textAnchor: { textSegments: [{ endIndex: 14 }] } } },
        ],
      },
    }]);

    const client = await createDocumentAiClient(config);
    const result = await client.extractText(Buffer.from('pdf data'));

    expect(mockProcessDocument).toHaveBeenCalledWith({
      name: 'projects/test-project/locations/us/processors/proc-123',
      rawDocument: {
        content: Buffer.from('pdf data').toString('base64'),
        mimeType: 'application/pdf',
      },
    });
    expect(result.text).toBe('Extracted text');
    expect(result.metadata.pages).toBe('1');
    expect(result.page_boundaries).toEqual([0]);
  });

  it('should return empty text for empty document', async () => {
    mockProcessDocument.mockResolvedValue([{
      document: { text: '', pages: [] },
    }]);

    const client = await createDocumentAiClient(config);
    const result = await client.extractText(Buffer.from('pdf'));

    expect(result.text).toBe('');
    expect(result.metadata.pages).toBe('0');
    expect(result.page_boundaries).toEqual([]);
  });

  it('should use custom location', async () => {
    mockProcessDocument.mockResolvedValue([{
      document: { text: 'text', pages: [] },
    }]);

    const client = await createDocumentAiClient({ ...config, location: 'eu' });
    await client.extractText(Buffer.from('pdf'));

    expect(mockProcessDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'projects/test-project/locations/eu/processors/proc-123',
      }),
    );
  });

  it('should handle multiple pages with boundaries', async () => {
    mockProcessDocument.mockResolvedValue([{
      document: {
        text: 'Page one text\nPage two text',
        pages: [
          { layout: { textAnchor: { textSegments: [{ endIndex: 14 }] } } },
          { layout: { textAnchor: { textSegments: [{ endIndex: 28 }] } } },
        ],
      },
    }]);

    const client = await createDocumentAiClient(config);
    const result = await client.extractText(Buffer.from('pdf'));

    expect(result.page_boundaries).toEqual([0, 14]);
  });
});
