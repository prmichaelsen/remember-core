import type { ImportItem } from '../import.service.js';
import type { ExtractorRegistry } from './registry.js';

export interface ValidationError {
  index: number;
  error: string;
}

/**
 * Validate import items before job creation.
 * Returns array of validation errors, empty if all valid.
 */
export function validateImportItems(
  items: ImportItem[],
  registry: ExtractorRegistry,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (!item.content && !item.file_url) {
      errors.push({ index: i, error: 'Either content or file_url must be provided' });
      continue;
    }

    if (item.file_url && !item.mime_type) {
      errors.push({ index: i, error: 'mime_type required when file_url provided' });
      continue;
    }

    // Zips are containers handled by the zip expander, not by an extractor
    const ZIP_MIME_TYPES = ['application/zip'];
    if (item.file_url && item.mime_type && !ZIP_MIME_TYPES.includes(item.mime_type) && !registry.getExtractor(item.mime_type)) {
      errors.push({
        index: i,
        error: `Unsupported file type: ${item.mime_type}`,
      });
    }
  }

  return errors;
}
