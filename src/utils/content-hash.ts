import { createHash } from 'crypto';

/**
 * Compute a SHA-256 content hash for deduplication.
 * Hash is based on normalized content + sorted references.
 */
export function computeContentHash(content: string, references?: string[]): string {
  const normalized = content.trim();
  const sortedRefs = (references ?? []).slice().sort().join('\n');
  const input = sortedRefs ? `${normalized}\n${sortedRefs}` : normalized;
  return createHash('sha256').update(input).digest('hex');
}
