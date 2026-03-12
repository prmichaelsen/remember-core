import { validateImportItems } from './validation.js';
import { ExtractorRegistry } from './registry.js';
import type { FileExtractor, ExtractionResult } from './types.js';

function createRegistry(): ExtractorRegistry {
  const registry = new ExtractorRegistry();
  registry.register({
    supportedMimeTypes: ['application/pdf', 'text/plain'],
    extract: async (): Promise<ExtractionResult> => ({ text: '', metadata: {} }),
  } as FileExtractor);
  return registry;
}

describe('validateImportItems', () => {
  const registry = createRegistry();

  it('returns no errors for valid text-only items', () => {
    const errors = validateImportItems(
      [{ content: 'hello' }],
      registry,
    );
    expect(errors).toEqual([]);
  });

  it('returns no errors for valid file_url items', () => {
    const errors = validateImportItems(
      [{ file_url: 'https://example.com/file.pdf', mime_type: 'application/pdf' }],
      registry,
    );
    expect(errors).toEqual([]);
  });

  it('rejects items with neither content nor file_url', () => {
    const errors = validateImportItems([{}], registry);
    expect(errors).toEqual([
      { index: 0, error: 'Either content or file_url must be provided' },
    ]);
  });

  it('rejects file_url without mime_type', () => {
    const errors = validateImportItems(
      [{ file_url: 'https://example.com/file.pdf' }],
      registry,
    );
    expect(errors).toEqual([
      { index: 0, error: 'mime_type required when file_url provided' },
    ]);
  });

  it('rejects unsupported MIME types', () => {
    const errors = validateImportItems(
      [{ file_url: 'https://example.com/file.xyz', mime_type: 'application/xyz' }],
      registry,
    );
    expect(errors).toEqual([
      { index: 0, error: 'Unsupported file type: application/xyz' },
    ]);
  });

  it('allows application/zip even without an extractor', () => {
    const errors = validateImportItems(
      [{ file_url: 'https://example.com/archive.zip', mime_type: 'application/zip' }],
      registry,
    );
    expect(errors).toEqual([]);
  });

  it('reports multiple errors with correct indices', () => {
    const errors = validateImportItems(
      [
        { content: 'valid' },
        {},
        { file_url: 'https://example.com/file.pdf' },
        { file_url: 'https://example.com/file.xyz', mime_type: 'application/xyz' },
      ],
      registry,
    );
    expect(errors).toHaveLength(3);
    expect(errors[0].index).toBe(1);
    expect(errors[1].index).toBe(2);
    expect(errors[2].index).toBe(3);
  });
});
