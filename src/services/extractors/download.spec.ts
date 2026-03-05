import { downloadFile } from './download.js';

describe('downloadFile', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('returns Buffer from successful download', async () => {
    const content = 'hello world';
    const arrayBuffer = new TextEncoder().encode(content).buffer;

    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(arrayBuffer, { status: 200 }),
    );

    const result = await downloadFile('https://example.com/file.pdf');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString('utf-8')).toBe('hello world');
  });

  it('throws on non-200 response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 403, statusText: 'Forbidden' }),
    );

    await expect(downloadFile('https://example.com/file.pdf'))
      .rejects.toThrow('Download failed: 403 Forbidden');
  });

  it('throws on 404 response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 404, statusText: 'Not Found' }),
    );

    await expect(downloadFile('https://example.com/file.pdf'))
      .rejects.toThrow('Download failed: 404 Not Found');
  });

  it('throws on network failure', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    await expect(downloadFile('https://example.com/file.pdf'))
      .rejects.toThrow('Failed to fetch');
  });

  it('handles binary content', async () => {
    const bytes = new Uint8Array([0x00, 0x01, 0xFF, 0xFE]);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(bytes.buffer, { status: 200 }),
    );

    const result = await downloadFile('https://example.com/binary');
    expect(result.length).toBe(4);
    expect(result[0]).toBe(0x00);
    expect(result[2]).toBe(0xFF);
  });
});
