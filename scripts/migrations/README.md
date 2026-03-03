# Migrations

Database migration scripts for remember-core schema changes.

## Available Migrations

### backfill-relationship-count

Populates `relationship_count` for all existing memories across all user collections.

**Purpose**: The denormalized `relationship_count` property enables efficient server-side sorting by relationship density. This migration backfills the property for memories created before Task 37.

**Usage**:
```bash
# Development/Staging
export ENVIRONMENT=development
npm run migrate:backfill-relationship-count

# Production
export ENVIRONMENT=production
npm run migrate:backfill-relationship-count
```

**Requirements**:
- `WEAVIATE_REST_URL` - Weaviate instance URL
- `WEAVIATE_API_KEY` - API key (if using cloud)
- `EMBEDDINGS_API_KEY` - OpenAI API key for embeddings
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account key (for Firestore collection registry)

**Safe to re-run**: Yes, idempotent. Updates relationship_count for all memories regardless of current value.

**Performance**:
- Processes ~100 memories per batch
- Estimated time: ~1 hour for 100k memories
- Memory usage: Minimal (batched processing)

**Output Example**:
```
=== Backfill relationship_count Migration ===

Found 3 collections in registry

Processing Memory_users_abc123...
  Updated 100 memories total...
  Updated 200 memories total...
  ✓ Completed Memory_users_abc123: 247 memories updated

Processing Memory_users_def456...
  Updated 300 memories total...
  ✓ Completed Memory_users_def456: 152 memories updated

=== Backfill Complete ===
Collections processed: 2
Memories updated: 399
Errors: 0

✓ Migration completed successfully
```

**Error Handling**:
- Individual memory update failures are logged but don't stop the migration
- Collection-level errors are logged and the script continues to next collection
- Exit code 1 if any errors occurred, 0 if successful
- Safe to re-run after fixing errors

**Verification**:
```bash
# Count memories without relationship_count
# (Use Weaviate console or admin API)

# Spot check a few memories
# Verify relationship_count matches relationships.length
```

## Best Practices

1. **Test First**: Always run migrations on development/staging before production
2. **Off-Peak Hours**: Run during low-traffic periods for production
3. **Monitor**: Watch logs for errors and performance issues
4. **Backup**: Consider taking a Weaviate snapshot before major migrations
5. **Idempotent**: Design migrations to be safe to re-run
6. **Logging**: Include detailed progress logging (every N records)
7. **Error Handling**: Continue processing after individual failures
8. **Exit Codes**: Return non-zero exit code on failure for CI/CD integration

## Common Issues

### Weaviate Connection Timeout
**Symptom**: Script fails with connection error
**Solution**:
- Check `WEAVIATE_REST_URL` is correct and Weaviate is accessible
- Verify API key is valid
- Check network connectivity

### Firestore Permission Denied
**Symptom**: Error reading collection registry
**Solution**:
- Verify `GOOGLE_APPLICATION_CREDENTIALS` points to valid service account key
- Check service account has Firestore read permissions

### Out of Memory
**Symptom**: Script crashes with heap error
**Solution**:
- Reduce `batchSize` in script (default: 100 → try 50 or 25)
- Increase Node.js heap size: `NODE_OPTIONS=--max-old-space-size=4096 npm run migrate:...`

### Some Memories Not Updated
**Symptom**: Verification shows some memories still missing relationship_count
**Solution**:
- Check console logs for specific error messages
- Re-run migration (it's idempotent)
- Manually inspect failed memory IDs in Weaviate console

## Migration Checklist

Before running a migration:
- [ ] Test on development environment first
- [ ] Review migration script for environment-specific logic
- [ ] Ensure all environment variables are set correctly
- [ ] Schedule during off-peak hours (for production)
- [ ] Notify team of planned migration window
- [ ] Have rollback plan if needed
- [ ] Monitor logs during execution
- [ ] Verify results after completion
- [ ] Document any issues or learnings
