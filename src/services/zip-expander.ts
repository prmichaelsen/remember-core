/**
 * Zip archive expansion for the import pipeline.
 *
 * Called by ImportJobWorker before extraction — expands zip items into
 * individual file items that flow through the normal extraction pipeline.
 */

import type { ImportItem } from './import.service.js';
import type { ExtractorRegistry } from './extractors/registry.js';
import type { Logger } from '../utils/logger.js';
import { mimeFromFilename } from './extractors/mime-map.js';

// ─── Constants ──────────────────────────────────────────────────────────

export const MAX_ZIP_ENTRIES = 100;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500 MB

const ZIP_MIME_TYPES = ['application/zip'];

// ─── Types ──────────────────────────────────────────────────────────────

export interface ZipOrigin {
  archive_filename: string;
  entry_path: string;
}

/**
 * Internal extension of ImportItem — carries a pre-loaded buffer
 * so the worker can skip the download step.
 */
export interface ImportItemWithBuffer extends ImportItem {
  _buffer?: Buffer;
}

// ─── Public API ─────────────────────────────────────────────────────────

export function isZipMimeType(mimeType: string): boolean {
  return ZIP_MIME_TYPES.includes(mimeType);
}

/**
 * Expand zip items into individual file items.
 *
 * Non-zip items pass through unchanged. Each supported file inside a zip
 * becomes a new ImportItem with a pre-loaded `_buffer`.
 */
export async function expandZipItems(
  items: ImportItem[],
  downloadFn: (url: string) => Promise<Buffer>,
  registry: ExtractorRegistry,
  logger: Logger,
): Promise<{ expandedItems: ImportItemWithBuffer[]; zipOrigins: Map<number, ZipOrigin> }> {
  let AdmZip: typeof import('adm-zip');
  try {
    AdmZip = (await import('adm-zip')).default;
  } catch {
    throw new Error('adm-zip is required for zip import support — install it as a dependency');
  }

  const expandedItems: ImportItemWithBuffer[] = [];
  const zipOrigins = new Map<number, ZipOrigin>();

  for (const item of items) {
    if (!item.file_url || !item.mime_type || !isZipMimeType(item.mime_type)) {
      expandedItems.push(item);
      continue;
    }

    logger.info('Downloading zip archive', { file_url: item.file_url });
    const buffer = await downloadFn(item.file_url);
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    // Enforce entry count limit
    const validEntries = entries.filter((e: { entryName: string; header: { size: number } }) => !shouldSkipEntry(e.entryName, e.header.size));
    if (validEntries.length > MAX_ZIP_ENTRIES) {
      throw new Error(
        `Zip contains ${validEntries.length} files, exceeding limit of ${MAX_ZIP_ENTRIES}`,
      );
    }

    // Enforce total uncompressed size limit
    const totalBytes = validEntries.reduce((sum: number, e: { header: { size: number } }) => sum + e.header.size, 0);
    if (totalBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error(
        `Zip uncompressed size ${totalBytes} bytes exceeds limit of ${MAX_ZIP_UNCOMPRESSED_BYTES} bytes`,
      );
    }

    const archiveFilename = item.source_filename ?? 'unknown.zip';

    for (const entry of validEntries) {
      const mime = mimeFromFilename(entry.entryName);
      if (!mime) {
        logger.info('Skipping zip entry: unknown MIME type', { entry: entry.entryName });
        continue;
      }

      // Skip if no extractor registered for this MIME type
      if (!registry.getExtractor(mime)) {
        logger.info('Skipping zip entry: no extractor', { entry: entry.entryName, mime });
        continue;
      }

      const entryBuffer = entry.getData();
      const idx = expandedItems.length;

      expandedItems.push({
        file_url: item.file_url, // preserve original URL for reference
        mime_type: mime,
        source_filename: entry.entryName.split('/').pop() ?? entry.entryName,
        _buffer: entryBuffer,
      });

      zipOrigins.set(idx, {
        archive_filename: archiveFilename,
        entry_path: entry.entryName,
      });
    }

    logger.info('Expanded zip archive', {
      archive: archiveFilename,
      entries_total: entries.length,
      entries_imported: expandedItems.length,
    });
  }

  return { expandedItems, zipOrigins };
}

// ─── Helpers ────────────────────────────────────────────────────────────

function shouldSkipEntry(entryName: string, size: number): boolean {
  // Skip directories
  if (entryName.endsWith('/')) return true;
  // Skip empty files
  if (size === 0) return true;
  // Skip macOS resource fork artifacts
  if (entryName.startsWith('__MACOSX/')) return true;
  // Skip macOS dot-underscore files
  const basename = entryName.split('/').pop() ?? entryName;
  if (basename.startsWith('._')) return true;
  // Skip nested zips
  if (entryName.toLowerCase().endsWith('.zip')) return true;
  return false;
}
