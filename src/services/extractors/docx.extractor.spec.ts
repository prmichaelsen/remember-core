import { DocxExtractor } from './docx.extractor.js';

const mockTurndownFn = jest.fn();

// Mock mammoth and turndown
jest.mock('mammoth', () => ({
  convertToHtml: jest.fn(),
}));

jest.mock('turndown', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      turndown: mockTurndownFn,
    })),
  };
});

import { convertToHtml } from 'mammoth';
import TurndownService from 'turndown';

const mockConvertToHtml = jest.mocked(convertToHtml);

describe('DocxExtractor', () => {
  const extractor = new DocxExtractor();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('supports DOCX MIME type', () => {
    expect(extractor.supportedMimeTypes).toEqual([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
  });

  it('converts DOCX to Markdown via mammoth + turndown', async () => {
    const html = '<h1>Title</h1><p>Body text.</p>';
    const markdown = '# Title\n\nBody text.';

    mockConvertToHtml.mockResolvedValue({
      value: html,
      messages: [],
    });
    mockTurndownFn.mockReturnValue(markdown);

    const result = await extractor.extract(Buffer.from('fake-docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    expect(result.text).toBe(markdown);
    expect(result.metadata).toEqual({});
    expect(mockConvertToHtml).toHaveBeenCalledWith({ buffer: expect.any(Buffer) });
  });

  it('handles empty document', async () => {
    mockConvertToHtml.mockResolvedValue({
      value: '',
      messages: [],
    });
    mockTurndownFn.mockReturnValue('');

    const result = await extractor.extract(Buffer.from('fake-docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(result.text).toBe('');
  });

  it('returns no page boundaries', async () => {
    mockConvertToHtml.mockResolvedValue({
      value: '<p>test</p>',
      messages: [],
    });
    mockTurndownFn.mockReturnValue('test');

    const result = await extractor.extract(Buffer.from('fake-docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(result.page_boundaries).toBeUndefined();
  });

  it('configures turndown with ATX headings', async () => {
    mockConvertToHtml.mockResolvedValue({
      value: '<p>test</p>',
      messages: [],
    });
    mockTurndownFn.mockReturnValue('test');

    await extractor.extract(Buffer.from('fake-docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    expect(TurndownService).toHaveBeenCalledWith({ headingStyle: 'atx' });
  });
});
