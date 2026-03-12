/**
 * SyntheticMemoryRegistry — extensible provider registry for synthetic memory types.
 *
 * Synthetic memories are read-only, memory-shaped objects produced by internal services
 * (mood, perception, etc.) rather than stored in Weaviate. The registry lets SpaceService
 * fetch all registered synthetic memories when the 'core' space is requested.
 *
 * Adding a new synthetic memory type requires only implementing SyntheticMemoryProvider
 * and registering it with the registry.
 */

// ─── Interfaces ─────────────────────────────────────────────────────────

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

// ─── Default Implementation ─────────────────────────────────────────────

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
        // Skip failed providers silently — one broken provider shouldn't crash the whole fetch
      }
    }
    return results;
  }
}
