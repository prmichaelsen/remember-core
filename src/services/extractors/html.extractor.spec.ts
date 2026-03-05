import { describe, it, expect } from 'vitest';
import { HtmlExtractor } from './html.extractor.js';

describe('HtmlExtractor', () => {
  const extractor = new HtmlExtractor();

  it('supports text/html', () => {
    expect(extractor.supportedMimeTypes).toEqual(['text/html']);
  });

  it('converts headings to ATX-style Markdown', async () => {
    const html = '<h1>Title</h1><h2>Subtitle</h2><p>Body text.</p>';
    const result = await extractor.extract(Buffer.from(html), 'text/html');
    expect(result.text).toContain('# Title');
    expect(result.text).toContain('## Subtitle');
    expect(result.text).toContain('Body text.');
  });

  it('converts links to Markdown', async () => {
    const html = '<p>Visit <a href="https://example.com">Example</a>.</p>';
    const result = await extractor.extract(Buffer.from(html), 'text/html');
    expect(result.text).toContain('[Example](https://example.com)');
  });

  it('converts bold and italic', async () => {
    const html = '<p><strong>bold</strong> and <em>italic</em></p>';
    const result = await extractor.extract(Buffer.from(html), 'text/html');
    expect(result.text).toContain('**bold**');
    expect(result.text).toContain('_italic_');
  });

  it('converts unordered lists', async () => {
    const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
    const result = await extractor.extract(Buffer.from(html), 'text/html');
    expect(result.text).toContain('*   Item 1');
    expect(result.text).toContain('*   Item 2');
  });

  it('handles empty HTML', async () => {
    const result = await extractor.extract(Buffer.from(''), 'text/html');
    expect(result.text).toBe('');
  });

  it('returns empty metadata', async () => {
    const result = await extractor.extract(Buffer.from('<p>test</p>'), 'text/html');
    expect(result.metadata).toEqual({});
  });

  it('returns no page boundaries', async () => {
    const result = await extractor.extract(Buffer.from('<p>test</p>'), 'text/html');
    expect(result.page_boundaries).toBeUndefined();
  });
});
