/**
 * Extension-to-MIME lookup for determining file types inside zip archives.
 */

const EXTENSION_MAP: Record<string, string> = {
  // Documents
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  // Structured data
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.yaml': 'application/x-yaml',
  '.yml': 'application/x-yaml',
};

/**
 * Determine MIME type from a filename's extension.
 * Returns null for unknown extensions.
 */
export function mimeFromFilename(filename: string): string | null {
  const dot = filename.lastIndexOf('.');
  if (dot === -1) return null;
  const ext = filename.slice(dot).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}
