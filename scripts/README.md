# Duplicate Detection Scripts

Scripts for finding and deduplicating memories in a Remember collection.

## Installation

First, install dependencies:

```bash
npm install
```

## Workflow

### 1. Find Duplicates

Scan a collection and generate a review file:

```bash
npm run duplicates:find <user_id> [options]
```

**Options:**
- `--collection-type <type>` - Collection type (default: `users`)
- `--output <file>` - Output file (default: `duplicates-review.json`)
- `--threshold <number>` - Embedding similarity threshold (default: `0.95`)
- `--fuzzy-threshold <number>` - Fuzzy string similarity threshold (default: `0.90`)
- `--limit <number>` - Max memories to scan (default: all)

**Example:**

```bash
npm run duplicates:find user_abc123 --output my-duplicates.json
```

This creates a JSON file with duplicate groups. Each group shows:
- Full memory content
- Similarity score
- Detection reasons (exact match, normalized match, embedding similarity, etc.)
- Suggested primary memory (highest weight, newest)

### 2. Review & Approve

Open the generated JSON file (`duplicates-review.json` by default) in your editor.

For each group, set the `action` field:
- `"merge"` - Deduplicate this group (keep primary, delete duplicates)
- `"skip"` - False positive, don't process
- Add `"notes"` for your reference (optional)

**Example:**

```json
{
  "groups": [
    {
      "group_id": "group_1",
      "primary_memory_id": "mem_xyz",
      "duplicate_memory_ids": ["mem_abc", "mem_def"],
      "similarity": 0.98,
      "reasons": ["Exact content match"],
      "memories": [...],
      "action": "merge",
      "notes": "Definite duplicates"
    },
    {
      "group_id": "group_2",
      "primary_memory_id": "mem_123",
      "duplicate_memory_ids": ["mem_456"],
      "similarity": 0.92,
      "reasons": ["High embedding similarity (0.923)"],
      "memories": [...],
      "action": "skip",
      "notes": "Similar but distinct memories"
    }
  ]
}
```

### 3. Process Duplicates

Apply the approved deduplication:

```bash
npm run duplicates:process <review-file.json> [options]
```

**Options:**
- `--dry-run` - Show what would be deleted without actually deleting
- `--no-confirm` - Skip confirmation prompt

**Examples:**

```bash
# Dry run (preview)
npm run duplicates:process my-duplicates.json --dry-run

# Apply changes
npm run duplicates:process my-duplicates.json

# Apply changes without confirmation
npm run duplicates:process my-duplicates.json --no-confirm
```

The script will:
1. Show a summary of groups to process
2. Prompt for confirmation (unless `--no-confirm`)
3. Delete duplicate memories, keeping the primary
4. Display statistics (groups processed, memories deleted, errors)

## Detection Strategies

The duplicate finder uses multiple strategies:

### 1. Exact Match
Identical content strings.

### 2. Normalized Match
Same content after trimming whitespace and converting to lowercase.

### 3. Embedding Similarity
Cosine similarity of vector embeddings ≥ threshold (default: 0.95).

Requires memories to have embeddings from Weaviate.

### 4. Fuzzy Similarity
Levenshtein distance-based string similarity ≥ threshold (default: 0.90).

Catches typos, minor edits, formatting differences.

## Grouping

When multiple memories are duplicates of each other (transitive), they're grouped into a single cluster. The script suggests a primary memory to keep based on:

1. **Highest weight** (user-set importance)
2. **Newest creation date** (tie-breaker)

## Environment Variables

Set Weaviate connection via environment variables:

```bash
export WEAVIATE_HOST=localhost
export WEAVIATE_PORT=8080
export WEAVIATE_SCHEME=http
```

Or use a `.env` file.

## Tips

- **Start with dry-run**: Always use `--dry-run` first to preview changes
- **Review carefully**: Check the full memory content in the JSON file before approving
- **Use notes**: Add notes to document your review decisions
- **Lower thresholds cautiously**: Lowering similarity thresholds finds more candidates but increases false positives
- **Adjust for your data**: Text-heavy memories may need higher fuzzy thresholds; short memories may need lower embedding thresholds

## Example Full Workflow

```bash
# 1. Find duplicates
npm run duplicates:find user_abc123 --output my-review.json

# 2. Review the JSON file in your editor
# Set "action": "merge" for groups to deduplicate

# 3. Preview changes
npm run duplicates:process my-review.json --dry-run

# 4. Apply changes
npm run duplicates:process my-review.json
```

## Utilities

The underlying duplicate detection functions are exported from `@prmichaelsen/remember-core/utils`:

```typescript
import {
  findDuplicateCandidates,
  groupDuplicates,
  isExactDuplicate,
  isNormalizedDuplicate,
  isEmbeddingDuplicate,
  isFuzzyDuplicate,
  cosineSimilarity,
  fuzzySimilarity,
} from '@prmichaelsen/remember-core/utils';

// Use in your own scripts
const memories = [...];
const candidates = findDuplicateCandidates(memories, {
  embeddingSimilarityThreshold: 0.95,
  fuzzySimilarityThreshold: 0.90,
});

const groups = groupDuplicates(candidates);
```
