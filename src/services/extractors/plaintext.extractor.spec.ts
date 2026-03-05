import { PlaintextExtractor } from './plaintext.extractor.js';

describe('PlaintextExtractor', () => {
  const extractor = new PlaintextExtractor();

  it('supports expected MIME types', () => {
    expect(extractor.supportedMimeTypes).toEqual([
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'application/x-yaml',
      'text/yaml',
    ]);
  });

  it('returns UTF-8 text as-is for text/plain', async () => {
    const content = Buffer.from('Hello, world!');
    const result = await extractor.extract(content, 'text/plain');
    expect(result.text).toBe('Hello, world!');
    expect(result.metadata).toEqual({});
  });

  it('returns UTF-8 text for text/markdown', async () => {
    const md = '# Heading\n\nSome **bold** text.';
    const result = await extractor.extract(Buffer.from(md), 'text/markdown');
    expect(result.text).toBe(md);
  });

  it('returns CSV content unchanged', async () => {
    const csv = 'name,age\nAlice,30\nBob,25';
    const result = await extractor.extract(Buffer.from(csv), 'text/csv');
    expect(result.text).toBe(csv);
  });

  it('returns JSON content unchanged', async () => {
    const json = '{"key": "value"}';
    const result = await extractor.extract(Buffer.from(json), 'application/json');
    expect(result.text).toBe(json);
  });

  it('returns YAML content unchanged', async () => {
    const yaml = 'key: value\nlist:\n  - item1\n  - item2';
    const result = await extractor.extract(Buffer.from(yaml), 'application/x-yaml');
    expect(result.text).toBe(yaml);
  });

  it('handles empty content', async () => {
    const result = await extractor.extract(Buffer.from(''), 'text/plain');
    expect(result.text).toBe('');
  });

  it('handles unicode content', async () => {
    const text = 'Hello 世界 🌍 こんにちは';
    const result = await extractor.extract(Buffer.from(text), 'text/plain');
    expect(result.text).toBe(text);
  });

  it('returns no page boundaries', async () => {
    const result = await extractor.extract(Buffer.from('text'), 'text/plain');
    expect(result.page_boundaries).toBeUndefined();
  });
});
