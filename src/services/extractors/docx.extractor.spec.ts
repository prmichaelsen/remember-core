import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DocxExtractor } from './docx.extractor.js';

// Mock mammoth and turndown
vi.mock('mammoth', () => ({
  convertToHtml: vi.fn(),
}));

vi.mock('turndown', () => {
  const mockTurndown = vi.fn();
  mockTurndown.prototype.turndown = vi.fn();
  return { default: mockTurndown };
});

import { convertToHtml } from 'mammoth';
import TurndownService from 'turndown';

const mockConvertToHtml = vi.mocked(convertToHtml);

describe('DocxExtractor', () => {
  const extractor = new DocxExtractor();

  beforeEach(() => {
    vi.resetAllMocks();
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
    vi.mocked(TurndownService.prototype.turndown).mockReturnValue(markdown);

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
    vi.mocked(TurndownService.prototype.turndown).mockReturnValue('');

    const result = await extractor.extract(Buffer.from('fake-docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(result.text).toBe('');
  });

  it('returns no page boundaries', async () => {
    mockConvertToHtml.mockResolvedValue({
      value: '<p>test</p>',
      messages: [],
    });
    vi.mocked(TurndownService.prototype.turndown).mockReturnValue('test');

    const result = await extractor.extract(Buffer.from('fake-docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(result.page_boundaries).toBeUndefined();
  });

  it('configures turndown with ATX headings', async () => {
    mockConvertToHtml.mockResolvedValue({
      value: '<p>test</p>',
      messages: [],
    });
    vi.mocked(TurndownService.prototype.turndown).mockReturnValue('test');

    await extractor.extract(Buffer.from('fake-docx'), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

    expect(TurndownService).toHaveBeenCalledWith({ headingStyle: 'atx' });
  });
});
