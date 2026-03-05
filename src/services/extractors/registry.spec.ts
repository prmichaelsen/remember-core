import { describe, it, expect } from 'vitest';
import { ExtractorRegistry, createDefaultRegistry } from './registry.js';
import type { FileExtractor, ExtractionResult } from './types.js';

function createMockExtractor(mimeTypes: string[]): FileExtractor {
  return {
    supportedMimeTypes: mimeTypes,
    extract: async (_content: Buffer, _mimeType: string): Promise<ExtractionResult> => ({
      text: 'extracted text',
      metadata: {},
    }),
  };
}

describe('ExtractorRegistry', () => {
  it('returns null for unregistered MIME type', () => {
    const registry = new ExtractorRegistry();
    expect(registry.getExtractor('application/pdf')).toBeNull();
  });

  it('registers and looks up extractor by MIME type', () => {
    const registry = new ExtractorRegistry();
    const extractor = createMockExtractor(['application/pdf']);
    registry.register(extractor);

    expect(registry.getExtractor('application/pdf')).toBe(extractor);
  });

  it('returns first matching extractor when multiple match', () => {
    const registry = new ExtractorRegistry();
    const first = createMockExtractor(['text/plain']);
    const second = createMockExtractor(['text/plain']);
    registry.register(first);
    registry.register(second);

    expect(registry.getExtractor('text/plain')).toBe(first);
  });

  it('supports extractors with multiple MIME types', () => {
    const registry = new ExtractorRegistry();
    const extractor = createMockExtractor(['text/plain', 'text/markdown', 'text/csv']);
    registry.register(extractor);

    expect(registry.getExtractor('text/plain')).toBe(extractor);
    expect(registry.getExtractor('text/markdown')).toBe(extractor);
    expect(registry.getExtractor('text/csv')).toBe(extractor);
  });

  it('returns all supported MIME types', () => {
    const registry = new ExtractorRegistry();
    registry.register(createMockExtractor(['application/pdf']));
    registry.register(createMockExtractor(['text/plain', 'text/markdown']));

    const types = registry.getSupportedMimeTypes();
    expect(types).toEqual(['application/pdf', 'text/plain', 'text/markdown']);
  });

  it('returns empty array when no extractors registered', () => {
    const registry = new ExtractorRegistry();
    expect(registry.getSupportedMimeTypes()).toEqual([]);
  });
});

describe('createDefaultRegistry', () => {
  it('returns an ExtractorRegistry instance', () => {
    const registry = createDefaultRegistry();
    expect(registry).toBeInstanceOf(ExtractorRegistry);
  });

  it('registers built-in extractors by default', () => {
    const registry = createDefaultRegistry();
    const types = registry.getSupportedMimeTypes();
    expect(types).toContain('text/plain');
    expect(types).toContain('text/html');
  });
});
