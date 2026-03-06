import { computeContentHash } from './content-hash.js';

describe('computeContentHash', () => {
  it('returns consistent output for same input', () => {
    const hash1 = computeContentHash('hello world');
    const hash2 = computeContentHash('hello world');
    expect(hash1).toBe(hash2);
  });

  it('returns different output for different content', () => {
    const hash1 = computeContentHash('hello world');
    const hash2 = computeContentHash('goodbye world');
    expect(hash1).not.toBe(hash2);
  });

  it('produces a 64-character hex string (SHA-256)', () => {
    const hash = computeContentHash('test');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('trims whitespace from content', () => {
    const hash1 = computeContentHash('  hello world  ');
    const hash2 = computeContentHash('hello world');
    expect(hash1).toBe(hash2);
  });

  it('handles empty references', () => {
    const hash1 = computeContentHash('hello', []);
    const hash2 = computeContentHash('hello');
    expect(hash1).toBe(hash2);
  });

  it('handles undefined references', () => {
    const hash1 = computeContentHash('hello', undefined);
    const hash2 = computeContentHash('hello');
    expect(hash1).toBe(hash2);
  });

  it('sorts references so order does not matter', () => {
    const hash1 = computeContentHash('hello', ['http://b.com', 'http://a.com']);
    const hash2 = computeContentHash('hello', ['http://a.com', 'http://b.com']);
    expect(hash1).toBe(hash2);
  });

  it('includes references in hash', () => {
    const hashNoRefs = computeContentHash('hello');
    const hashWithRefs = computeContentHash('hello', ['http://example.com']);
    expect(hashNoRefs).not.toBe(hashWithRefs);
  });

  it('different references produce different hashes', () => {
    const hash1 = computeContentHash('hello', ['http://a.com']);
    const hash2 = computeContentHash('hello', ['http://b.com']);
    expect(hash1).not.toBe(hash2);
  });
});
