# Task 513: Extensible Synthetic Memory Registry

**Milestone**: M76 — Synthetic Core Space
**Status**: not_started
**Estimated Hours**: 2
**Dependencies**: None

---

## Objective

Create a registry pattern for synthetic memory providers so new core memory types can be added by registering a provider — no SpaceService changes needed.

## Steps

### 1. Define interfaces

```typescript
export interface SyntheticMemoryProvider {
  /** Unique key for this provider (e.g., 'mood', 'perception') */
  key: string;
  /** Fetch the synthetic memory, or null if unavailable */
  fetch(userId: string, ghostCompositeId: string): Promise<Record<string, unknown> | null>;
}

export interface SyntheticMemoryRegistry {
  /** Register a provider */
  register(provider: SyntheticMemoryProvider): void;
  /** Fetch all synthetic memories from all registered providers */
  fetchAll(userId: string, ghostCompositeId: string): Promise<Record<string, unknown>[]>;
}
```

### 2. Implement registry

```typescript
export class DefaultSyntheticMemoryRegistry implements SyntheticMemoryRegistry {
  private providers = new Map<string, SyntheticMemoryProvider>();

  register(provider: SyntheticMemoryProvider): void {
    this.providers.set(provider.key, provider);
  }

  async fetchAll(userId: string, ghostCompositeId: string): Promise<Record<string, unknown>[]> {
    const results: Record<string, unknown>[] = [];
    for (const provider of this.providers.values()) {
      try {
        const result = await provider.fetch(userId, ghostCompositeId);
        if (result) results.push(result);
      } catch {
        // Skip failed providers silently
      }
    }
    return results;
  }
}
```

### 3. Factory helper

```typescript
export function createCoreRegistry(deps: {
  moodService?: MoodService;
  perceptionService?: PerceptionService;
}): SyntheticMemoryRegistry {
  const registry = new DefaultSyntheticMemoryRegistry();
  if (deps.moodService) registry.register(new MoodMemoryProvider(deps.moodService));
  if (deps.perceptionService) registry.register(new PerceptionMemoryProvider(deps.perceptionService));
  return registry;
}
```

### 4. Export from barrel

Add to `src/services/index.ts`:
- `SyntheticMemoryProvider`, `SyntheticMemoryRegistry`, `DefaultSyntheticMemoryRegistry`
- `createCoreRegistry`
- `formatMoodAsMemory`, `formatPerceptionAsMemory`

### 5. Tests

- Registry with no providers returns empty array
- Registry with mood provider returns mood memory
- Registry with multiple providers returns all
- Failed provider is skipped (no throw)
- `createCoreRegistry()` wires up available services
- Duplicate key registration overwrites

## Verification

- [ ] Registry interface is clean and extensible
- [ ] Adding a new synthetic type requires only implementing `SyntheticMemoryProvider`
- [ ] Failed providers don't crash `fetchAll()`
- [ ] Factory helper creates registry from available services
- [ ] Exported from services barrel
- [ ] Colocated tests in `.spec.ts`
