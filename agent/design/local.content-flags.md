# Content Flag System

**Concept**: Multi-flag content rating system with tiered sexual content and combinable independent flags
**Created**: 2026-03-12
**Status**: Design Specification

---

## Overview

Content flags classify content appropriateness using a tiered sexual content scale and independent combinable flags. The system supports multiple simultaneous flags per memory, enabling accurate classification of content that spans multiple categories.

---

## Solution

Split content flags into two groups with different combination rules:

### Sexual Content Tier (mutually exclusive, pick one)

Escalating scale — exactly one must be selected:

| Tier | Description |
|------|-------------|
| `justforkids` | PG content suitable for children. **Mutually exclusive with ALL other flags.** |
| `sfw` | Suitable for mature adults and work environments |
| `suggestive` | Sexually suggestive but no explicit content |
| `nsfw` | Not safe for work — risqué but not sexually explicit |
| `nudity` | Sexually explicit content |

Hierarchy: `justforkids` < `sfw` < `suggestive` < `nsfw` < `nudity`

### Independent Flags (combinable)

Can be combined with each other and with any sexual tier flag (except `justforkids`):

| Flag | Description |
|------|-------------|
| `mature` | Explicit language or mature topics |
| `violence` | Depicts or infers violence |
| `nsfl` | Death, disturbing scenes, or suicide |
| `drugs` | Drug use, references, or promotion |

### Exclusivity Rules

1. `justforkids` is mutually exclusive with ALL other flags (sexual and independent)
2. Sexual tier flags are mutually exclusive with each other (pick exactly one)
3. Independent flags can be combined freely with each other
4. Independent flags can be combined with any sexual tier flag except `justforkids`

---

## Implementation

### Type Definitions

```typescript
/** Sexual content tier — mutually exclusive, pick one */
type SexualContentTier = 'justforkids' | 'sfw' | 'suggestive' | 'nsfw' | 'nudity';

/** Independent content flags — combinable */
type IndependentContentFlag = 'mature' | 'violence' | 'nsfl' | 'drugs';

/** All possible content flag values */
type ContentFlagValue = SexualContentTier | IndependentContentFlag;

/**
 * Content flags for a memory.
 * - Exactly one SexualContentTier is required
 * - Zero or more IndependentContentFlags may be added
 * - If tier is 'justforkids', no independent flags are allowed
 */
interface ContentFlags {
  tier: SexualContentTier;
  flags: IndependentContentFlag[];
}
```

### Validation

```typescript
function validateContentFlags(contentFlags: ContentFlags): boolean {
  if (contentFlags.tier === 'justforkids' && contentFlags.flags.length > 0) {
    return false;
  }
  if (new Set(contentFlags.flags).size !== contentFlags.flags.length) {
    return false;
  }
  return true;
}
```

---

## Dependencies

- Memory types — `ContentFlags` added to memory schema
- Weaviate schema — new properties for tier + flags
- Search/filtering — support filtering by tier and flags

---

## Testing Strategy

- Validate that `justforkids` rejects any additional flags
- Validate that only one sexual tier can be selected
- Validate that independent flags combine freely
- Test search filtering with multi-flag content

---

**Status**: Design Specification
**Recommendation**: Implement type definitions and validation, then wire into memory schema
**Related Documents**: [local.content-moderation.md](local.content-moderation.md)
