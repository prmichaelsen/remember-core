#!/usr/bin/env node
/**
 * Migrate ghost memory tags from old LLM-driven scheme to new platform-driven scheme.
 *
 * Old tags (set by LLM via prompt instructions):
 *   ghost_owner:{ownerId}         → ghost_owner:user:{ownerId}
 *   ghost_type:personal           → ghost_type:user
 *   ghost_user:{accessorUserId}   → kept as-is
 *   (no base 'ghost' tag)         → ghost (added)
 *
 * Old space ghost tags:
 *   ghost_owner:space:{spaceId}   → already correct (kept)
 *   ghost_type:space              → already correct (kept)
 *   ghost_user:{userId}           → kept as-is
 *   (no base 'ghost' tag)         → ghost (added)
 *
 * Usage:
 *   ENVIRONMENT=production node --import tsx/esm scripts/migrations/migrate-ghost-tags.ts
 *
 * Options:
 *   --dry-run     Print what would change without writing (default: false)
 *   --user <id>   Only migrate a specific user's collection
 *
 * Safe to re-run: Yes (idempotent — already-migrated tags are skipped)
 */

import { initWeaviateClient, getWeaviateClient } from '../../src/database/weaviate/client.js';
import { queryDocuments } from '../../src/database/firestore/init.js';
import { getCollectionRegistryPath } from '../../src/database/firestore/paths.js';

interface MigrationStats {
  collections_processed: number;
  memories_scanned: number;
  memories_migrated: number;
  memories_skipped: number;
  memories_already_migrated: number;
  errors: number;
}

const dryRun = process.argv.includes('--dry-run');
const userArgIdx = process.argv.indexOf('--user');
const targetUser = userArgIdx !== -1 ? process.argv[userArgIdx + 1] : undefined;

/**
 * Transform old ghost tags to new scheme.
 * Returns null if no changes needed.
 */
function migrateGhostTags(oldTags: string[]): string[] | null {
  const newTags: string[] = [];
  let changed = false;

  // Check if already migrated (has base 'ghost' tag and new-format owner tag)
  const hasBaseGhost = oldTags.includes('ghost');
  const hasNewOwnerFormat = oldTags.some(t => t.startsWith('ghost_owner:user:') || t.startsWith('ghost_owner:space:'));

  if (hasBaseGhost && hasNewOwnerFormat) {
    return null; // Already migrated
  }

  for (const tag of oldTags) {
    if (tag === 'ghost_type:personal') {
      // ghost_type:personal → ghost_type:user
      newTags.push('ghost_type:user');
      changed = true;
    } else if (tag.startsWith('ghost_owner:') && !tag.startsWith('ghost_owner:user:') && !tag.startsWith('ghost_owner:space:')) {
      // ghost_owner:{ownerId} → ghost_owner:user:{ownerId}
      // (but NOT ghost_owner:space:{id} which is already correct)
      const ownerId = tag.replace('ghost_owner:', '');
      newTags.push(`ghost_owner:user:${ownerId}`);
      changed = true;
    } else {
      // Keep all other tags as-is (ghost_user:*, ghost_type:space, ghost_owner:space:*, etc.)
      newTags.push(tag);
    }
  }

  // Add base 'ghost' tag if missing
  if (!newTags.includes('ghost')) {
    newTags.push('ghost');
    changed = true;
  }

  // Add ghost_type:user if we had a user ghost but no ghost_type tag at all
  if (!newTags.some(t => t.startsWith('ghost_type:')) && newTags.some(t => t.startsWith('ghost_owner:user:'))) {
    newTags.push('ghost_type:user');
    changed = true;
  }

  // Add ghost_type:space if we had a space ghost but no ghost_type tag
  if (!newTags.some(t => t.startsWith('ghost_type:')) && newTags.some(t => t.startsWith('ghost_owner:space:'))) {
    newTags.push('ghost_type:space');
    changed = true;
  }

  return changed ? newTags : null;
}

async function migrateGhostMemoryTags() {
  console.log(`=== Ghost Tag Migration ===${dryRun ? ' [DRY RUN]' : ''}`);
  if (targetUser) console.log(`Targeting user: ${targetUser}`);
  console.log();

  const stats: MigrationStats = {
    collections_processed: 0,
    memories_scanned: 0,
    memories_migrated: 0,
    memories_skipped: 0,
    memories_already_migrated: 0,
    errors: 0,
  };

  // Initialize Weaviate client
  await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.EMBEDDINGS_API_KEY!,
  });

  const client = getWeaviateClient();

  // Get all collections from Firestore registry
  const path = getCollectionRegistryPath();
  const registryEntries = await queryDocuments(path, {
    orderBy: [{ field: 'collection_name', direction: 'ASCENDING' }],
  });

  console.log(`Found ${registryEntries.length} collections in registry\n`);

  for (const entry of registryEntries) {
    const collectionName = entry.data.collection_name as string;

    // Only process Memory_users_ collections
    if (!collectionName.startsWith('Memory_users_')) continue;

    // If targeting a specific user, skip others
    if (targetUser && collectionName !== `Memory_users_${targetUser}`) continue;

    console.log(`Processing ${collectionName}...`);

    try {
      const exists = await client.collections.exists(collectionName);
      if (!exists) {
        console.log(`  ⚠️  Collection not found in Weaviate, skipping`);
        continue;
      }

      const collection = client.collections.get(collectionName);

      // Offset-based pagination — only fetch ghost memories
      // (Weaviate doesn't allow cursor 'after' with 'filters', so we use offset)
      const batchSize = 100;
      let offset = 0;
      let collectionMigrated = 0;
      let collectionAlreadyMigrated = 0;

      while (true) {
        const results = await collection.query.fetchObjects({
          limit: batchSize,
          offset,
          returnProperties: ['doc_type', 'content_type', 'tags', 'content'],
          filters: collection.filter.byProperty('content_type').equal('ghost'),
        });

        if (results.objects.length === 0) break;

        for (const obj of results.objects) {
          stats.memories_scanned++;
          const tags = (obj.properties.tags as string[]) || [];
          const content = (obj.properties.content as string) || '';

          const newTags = migrateGhostTags(tags);

          if (newTags === null) {
            // Already migrated or no changes needed
            stats.memories_already_migrated++;
            collectionAlreadyMigrated++;
            continue;
          }

          if (!dryRun) {
            try {
              await collection.data.update({
                id: obj.uuid,
                properties: { tags: newTags },
              });
              stats.memories_migrated++;
              collectionMigrated++;
            } catch (error) {
              console.error(`  ❌ Error migrating ${obj.uuid}:`, error);
              stats.errors++;
            }
          } else {
            stats.memories_migrated++;
            collectionMigrated++;
            const preview = content.length > 60 ? content.slice(0, 60) + '...' : content;
            console.log(`  [dry-run] ${obj.uuid}`);
            console.log(`    content: "${preview}"`);
            console.log(`    old tags: [${tags.join(', ')}]`);
            console.log(`    new tags: [${newTags.join(', ')}]`);
          }
        }

        offset += results.objects.length;
        if (results.objects.length < batchSize) break;
      }

      stats.collections_processed++;
      if (collectionMigrated > 0 || collectionAlreadyMigrated > 0) {
        console.log(`  ✓ ${collectionName}: ${collectionMigrated} migrated, ${collectionAlreadyMigrated} already current\n`);
      } else {
        console.log(`  ✓ ${collectionName}: no ghost memories found\n`);
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${collectionName}:`, error);
      stats.errors++;
    }
  }

  console.log('=== Migration Complete ===');
  console.log(`Collections processed: ${stats.collections_processed}`);
  console.log(`Ghost memories scanned: ${stats.memories_scanned}`);
  console.log(`Ghost memories migrated: ${stats.memories_migrated}`);
  console.log(`Ghost memories already current: ${stats.memories_already_migrated}`);
  console.log(`Errors: ${stats.errors}`);

  if (dryRun) {
    console.log('\n📝 This was a dry run. No data was modified.');
    console.log('   Run without --dry-run to apply changes.');
  }

  if (stats.errors > 0) {
    console.log('\n⚠️  Some errors occurred. Check logs above for details.');
    process.exit(1);
  }
}

// Run migration
migrateGhostMemoryTags()
  .then(() => {
    console.log('\n✓ Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
