import { describe, it, expect, vi } from 'vitest';
import { ImageExtractor } from './image.extractor.js';
import type { VisionClient } from './image.extractor.js';

describe('ImageExtractor', () => {
  function createMockClient(text: string): VisionClient {
    return { detectText: vi.fn().mockResolvedValue(text) };
  }

  it('supports all image MIME types', () => {
    const extractor = new ImageExtractor(createMockClient(''));
    expect(extractor.supportedMimeTypes).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/tiff',
    ]);
  });

  it('extracts text via Vision API', async () => {
    const client = createMockClient('Hello from OCR');
    const extractor = new ImageExtractor(client);

    const result = await extractor.extract(Buffer.from('fake-image'), 'image/png');

    expect(result.text).toBe('Hello from OCR');
    expect(result.metadata).toEqual({});
    expect(client.detectText).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it('handles empty OCR result', async () => {
    const extractor = new ImageExtractor(createMockClient(''));
    const result = await extractor.extract(Buffer.from('fake-image'), 'image/jpeg');
    expect(result.text).toBe('');
  });

  it('propagates Vision API errors', async () => {
    const client: VisionClient = {
      detectText: vi.fn().mockRejectedValue(new Error('Vision API error')),
    };
    const extractor = new ImageExtractor(client);

    await expect(extractor.extract(Buffer.from('fake'), 'image/png'))
      .rejects.toThrow('Vision API error');
  });

  it('returns no page boundaries', async () => {
    const extractor = new ImageExtractor(createMockClient('text'));
    const result = await extractor.extract(Buffer.from('fake'), 'image/png');
    expect(result.page_boundaries).toBeUndefined();
  });
});
