#!/usr/bin/env node
/**
 * Backfill collectionName on user-rating docs.
 *
 * Reads all user-rating docs from Firestore, resolves each memoryId
 * to its Weaviate collection name via MemoryIndexService, and writes
 * collectionName back to the rating doc.
 *
 * Usage:
 *   ENVIRONMENT=production node --import tsx/esm scripts/migrations/backfill-rating-collection-name.ts
 *
 * Requirements:
 *   - GOOGLE_APPLICATION_CREDENTIALS set (for Firestore)
 *
 * Safe to re-run: Yes (idempotent — uses Firestore set() merge)
 */

import { queryDocuments, setDocument } from '../../src/database/firestore/init.js';
import { getUserRatingsPath } from '../../src/database/firestore/paths.js';
import { MemoryIndexService } from '../../src/services/memory-index.service.js';

interface BackfillStats {
  users_processed: number;
  ratings_updated: number;
  ratings_skipped: number;
  lookup_failures: number;
  errors: number;
}

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

const BAR_WIDTH = 30;

function progressBar(current: number, total: number, label: string): string {
  const pct = total > 0 ? current / total : 0;
  const filled = Math.round(pct * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pctStr = (pct * 100).toFixed(0).padStart(3);
  return `  ${bar} ${pctStr}% ${current}/${total} ${label}`;
}

function clearLine() {
  process.stdout.write('\r\x1b[K');
}

/**
 * Get all user IDs that have rating docs.
 *
 * The user_ratings path is: {BASE}.user_ratings/{userId}/ratings
 * We need to enumerate user IDs. Since there's no direct Firestore
 * "list subcollections" API, this script requires a list of user IDs
 * passed via stdin or a Firestore query on the parent collection.
 *
 * For simplicity, this script accepts user IDs as CLI arguments or
 * reads them from a file passed as the first argument.
 */
async function getUserIds(): Promise<string[]> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('  Usage: backfill-rating-collection-name.ts <userId1> [userId2] ...');
    console.error('    or:  backfill-rating-collection-name.ts --file <user-ids.txt>');
    process.exit(1);
  }

  if (args[0] === '--file') {
    const fs = await import('fs');
    const content = fs.readFileSync(args[1], 'utf-8');
    return content.split('\n').map(l => l.trim()).filter(Boolean);
  }

  return args;
}

async function backfillRatingCollectionName() {
  console.log('\n  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   Backfill Rating Doc collectionName Migration   ║');
  console.log('  ╚══════════════════════════════════════════════════╝\n');

  const stats: BackfillStats = {
    users_processed: 0,
    ratings_updated: 0,
    ratings_skipped: 0,
    lookup_failures: 0,
    errors: 0,
  };

  const indexService = new MemoryIndexService(logger);
  const userIds = await getUserIds();

  console.log(`  Processing ${userIds.length} user(s)...\n`);

  for (let ui = 0; ui < userIds.length; ui++) {
    const userId = userIds[ui];
    const ratingsPath = getUserRatingsPath(userId);

    try {
      // Fetch all rating docs for this user
      const ratingDocs = await queryDocuments(ratingsPath, {
        orderBy: [{ field: 'updated_at', direction: 'DESCENDING' }],
      });

      if (ratingDocs.length === 0) {
        console.log(`  ⊘ ${userId} — no ratings, skipped`);
        stats.users_processed++;
        continue;
      }

      let updated = 0;
      let skipped = 0;

      for (let ri = 0; ri < ratingDocs.length; ri++) {
        const doc = ratingDocs[ri];
        const data = doc.data as Record<string, unknown>;
        const memoryId = (data.memoryId as string) ?? doc.id;

        // Skip if already has collectionName
        if (data.collectionName) {
          skipped++;
          continue;
        }

        // Resolve collection name via memory index
        const collectionName = await indexService.lookup(memoryId);
        if (!collectionName) {
          stats.lookup_failures++;
          continue;
        }

        // Update the rating doc with collectionName
        await setDocument(ratingsPath, doc.id, { ...data, collectionName } as any);
        updated++;

        clearLine();
        process.stdout.write(progressBar(ri + 1, ratingDocs.length, userId));
      }

      clearLine();
      console.log(`  ✓ ${userId} — ${updated} updated, ${skipped} already had collectionName`);
      stats.ratings_updated += updated;
      stats.ratings_skipped += skipped;
      stats.users_processed++;
    } catch (error) {
      clearLine();
      console.log(`  ✗ ${userId} — error: ${error instanceof Error ? error.message : error}`);
      stats.errors++;
    }
  }

  console.log('');
  console.log('  ┌──────────────────────────────────────┐');
  console.log(`  │ Users processed:  ${String(stats.users_processed).padStart(6)}             │`);
  console.log(`  │ Ratings updated:  ${String(stats.ratings_updated).padStart(6)}             │`);
  console.log(`  │ Already present:  ${String(stats.ratings_skipped).padStart(6)}             │`);
  console.log(`  │ Lookup failures:  ${String(stats.lookup_failures).padStart(6)}             │`);
  console.log(`  │ Errors:           ${String(stats.errors).padStart(6)}             │`);
  console.log('  └──────────────────────────────────────┘');

  if (stats.errors > 0 || stats.lookup_failures > 0) {
    console.log('\n  ⚠ Some ratings could not be resolved.\n');
  }
}

// Run migration
backfillRatingCollectionName()
  .then(() => {
    console.log('\n✓ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
