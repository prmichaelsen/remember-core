import { PdfExtractor } from './pdf.extractor.js';
import type { DocumentAiClient, Logger } from './pdf.extractor.js';
import type { ExtractionResult } from './types.js';

// Mock unpdf module
jest.mock('unpdf', () => ({
  extractText: jest.fn(),
  getMeta: jest.fn(),
}));

import { extractText, getMeta } from 'unpdf';

const mockExtractText = jest.mocked(extractText);
const mockGetMeta = jest.mocked(getMeta);

describe('PdfExtractor', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetMeta.mockResolvedValue({
      info: {},
      metadata: {} as any,
    });
  });

  it('supports application/pdf', () => {
    const extractor = new PdfExtractor();
    expect(extractor.supportedMimeTypes).toEqual(['application/pdf']);
  });

  it('extracts text from digital PDF via unpdf', async () => {
    mockExtractText.mockResolvedValue({
      text: ['Page 1 content', 'Page 2 content'],
      totalPages: 2,
    } as any);
    mockGetMeta.mockResolvedValue({
      info: { Title: 'Test Doc', Author: 'Alice' },
      metadata: {} as any,
    });

    const extractor = new PdfExtractor();
    const result = await extractor.extract(Buffer.from('fake-pdf'), 'application/pdf');

    expect(result.text).toBe('Page 1 content\n\nPage 2 content');
    expect(result.metadata.title).toBe('Test Doc');
    expect(result.metadata.author).toBe('Alice');
    expect(result.metadata.pages).toBe('2');
  });

  it('provides page boundaries', async () => {
    mockExtractText.mockResolvedValue({
      text: ['Page 1', 'Page 2', 'Page 3'],
      totalPages: 3,
    } as any);

    const extractor = new PdfExtractor();
    const result = await extractor.extract(Buffer.from('fake-pdf'), 'application/pdf');

    // 'Page 1' = 6 chars + 2 separator = offset 0, 8, 16
    expect(result.page_boundaries).toEqual([0, 8, 16]);
  });

  it('falls back to Document AI when text is near-empty', async () => {
    mockExtractText.mockResolvedValue({
      text: ['', ''],
      totalPages: 2,
    } as any);

    const ocrResult: ExtractionResult = {
      text: 'OCR extracted text from scanned document',
      metadata: { pages: '2' },
      page_boundaries: [0, 100],
    };
    const documentAiClient: DocumentAiClient = {
      extractText: jest.fn().mockResolvedValue(ocrResult),
    };
    const logger: Logger = { info: jest.fn(), warn: jest.fn() };

    const extractor = new PdfExtractor(documentAiClient, logger);
    const result = await extractor.extract(Buffer.from('fake-pdf'), 'application/pdf');

    expect(result).toBe(ocrResult);
    expect(documentAiClient.extractText).toHaveBeenCalledWith(expect.any(Buffer));
    expect(logger.info).toHaveBeenCalledWith(
      'PDF has no text layer, falling back to Document AI OCR',
    );
  });

  it('returns empty text when scanned and no Document AI client', async () => {
    mockExtractText.mockResolvedValue({
      text: [''],
      totalPages: 1,
    } as any);

    const extractor = new PdfExtractor();
    const result = await extractor.extract(Buffer.from('fake-pdf'), 'application/pdf');

    expect(result.text).toBe('');
    expect(result.metadata.pages).toBe('1');
  });

  it('does not fall back when text exceeds threshold', async () => {
    const longText = 'A'.repeat(100);
    mockExtractText.mockResolvedValue({
      text: [longText],
      totalPages: 1,
    } as any);

    const documentAiClient: DocumentAiClient = {
      extractText: jest.fn(),
    };

    const extractor = new PdfExtractor(documentAiClient);
    const result = await extractor.extract(Buffer.from('fake-pdf'), 'application/pdf');

    expect(result.text).toBe(longText);
    expect(documentAiClient.extractText).not.toHaveBeenCalled();
  });

  it('handles metadata extraction failure gracefully', async () => {
    mockExtractText.mockResolvedValue({
      text: ['Some content here that is long enough'],
      totalPages: 1,
    } as any);
    mockGetMeta.mockRejectedValue(new Error('Metadata error'));

    const extractor = new PdfExtractor();
    const result = await extractor.extract(Buffer.from('fake-pdf'), 'application/pdf');

    expect(result.text).toBe('Some content here that is long enough');
    expect(result.metadata.pages).toBe('1');
  });

  it('includes creation date in metadata', async () => {
    mockExtractText.mockResolvedValue({
      text: ['Content with enough characters to pass threshold test'],
      totalPages: 1,
    } as any);
    mockGetMeta.mockResolvedValue({
      info: { CreationDate: 'D:20240101120000' },
      metadata: {} as any,
    });

    const extractor = new PdfExtractor();
    const result = await extractor.extract(Buffer.from('fake-pdf'), 'application/pdf');
    expect(result.metadata.created).toBe('D:20240101120000');
  });
});
