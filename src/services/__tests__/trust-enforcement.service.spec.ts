import {
  TRUST_THRESHOLDS,
  buildTrustFilter,
  formatMemoryForPrompt,
  getTrustLevelLabel,
  getTrustInstructions,
  redactSensitiveFields,
  isTrustSufficient,
  resolveEnforcementMode,
} from '../trust-enforcement.service.js';
import type { Memory } from '../../types/memory.types.js';

function createTestMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    user_id: 'owner-1',
    doc_type: 'memory',
    content: 'Full memory content here',
    title: 'Test Memory',
    summary: 'A summary of the memory',
    type: 'note',
    weight: 0.5,
    trust: 0.5,
    confidence: 0.8,
    location: {
      gps: { latitude: 37.7749, longitude: -122.4194, timestamp: '2026-01-15T10:00:00Z' },
      address: { formatted: '123 Main St, San Francisco, CA', city: 'San Francisco', country: 'US' },
      source: 'gps',
      confidence: 0.9,
      is_approximate: false,
    },
    context: {
      timestamp: '2026-01-15T10:00:00Z',
      source: { type: 'conversation' },
      participants: [{ user_id: 'alice-1', name: 'Alice', role: 'user' }],
      environment: { device: 'laptop' },
      notes: 'Some context notes',
    },
    relationships: [],
    access_count: 5,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    version: 1,
    tags: ['test', 'important'],
    references: ['https://example.com'],
    base_weight: 0.5,
    ...overrides,
  };
}

describe('TrustEnforcementService', () => {
  describe('TRUST_THRESHOLDS', () => {
    it('has 5 tiers with correct values', () => {
      expect(TRUST_THRESHOLDS.FULL_ACCESS).toBe(1.0);
      expect(TRUST_THRESHOLDS.PARTIAL_ACCESS).toBe(0.75);
      expect(TRUST_THRESHOLDS.SUMMARY_ONLY).toBe(0.5);
      expect(TRUST_THRESHOLDS.METADATA_ONLY).toBe(0.25);
      expect(TRUST_THRESHOLDS.EXISTENCE_ONLY).toBe(0.0);
    });

    it('tiers are in descending order', () => {
      expect(TRUST_THRESHOLDS.FULL_ACCESS).toBeGreaterThan(TRUST_THRESHOLDS.PARTIAL_ACCESS);
      expect(TRUST_THRESHOLDS.PARTIAL_ACCESS).toBeGreaterThan(TRUST_THRESHOLDS.SUMMARY_ONLY);
      expect(TRUST_THRESHOLDS.SUMMARY_ONLY).toBeGreaterThan(TRUST_THRESHOLDS.METADATA_ONLY);
      expect(TRUST_THRESHOLDS.METADATA_ONLY).toBeGreaterThan(TRUST_THRESHOLDS.EXISTENCE_ONLY);
    });
  });

  describe('buildTrustFilter', () => {
    it('creates a filter with lessThanOrEqual', () => {
      const mockCollection = {
        filter: {
          byProperty: jest.fn().mockReturnValue({
            lessThanOrEqual: jest.fn().mockReturnValue('mock-filter'),
          }),
        },
      };

      const result = buildTrustFilter(mockCollection, 0.5);
      expect(mockCollection.filter.byProperty).toHaveBeenCalledWith('trust_score');
      expect(result).toBe('mock-filter');
    });

    it('passes accessor trust level to the filter', () => {
      const lessThanOrEqual = jest.fn().mockReturnValue('filter');
      const mockCollection = {
        filter: { byProperty: jest.fn().mockReturnValue({ lessThanOrEqual }) },
      };

      buildTrustFilter(mockCollection, 0.75);
      expect(lessThanOrEqual).toHaveBeenCalledWith(0.75);
    });
  });

  describe('formatMemoryForPrompt', () => {
    it('returns full content at trust 1.0 for self-access', () => {
      const memory = createTestMemory({ trust: 0.5 });
      const result = formatMemoryForPrompt(memory, 1.0, true);

      expect(result.trust_tier).toBe('Full Access');
      expect(result.content).toContain('Full memory content here');
      expect(result.content).toContain('Test Memory');
      expect(result.content).toContain('test, important');
    });

    it('returns existence-only for trust 1.0 memories in cross-user access', () => {
      const memory = createTestMemory({ trust: 1.0 });
      const result = formatMemoryForPrompt(memory, 1.0, false);

      expect(result.trust_tier).toBe('Existence Only');
      expect(result.content).toBe('A memory exists about this topic.');
      expect(result.content).not.toContain('Full memory content');
    });

    it('returns partial access at trust 0.75', () => {
      const memory = createTestMemory({ trust: 0.5 });
      const result = formatMemoryForPrompt(memory, 0.75);

      expect(result.trust_tier).toBe('Partial Access');
      expect(result.content).toContain('Full memory content here');
      expect(result.content).toContain('Tags:');
    });

    it('returns summary only at trust 0.5', () => {
      const memory = createTestMemory({ trust: 0.25 });
      const result = formatMemoryForPrompt(memory, 0.5);

      expect(result.trust_tier).toBe('Summary Only');
      expect(result.content).toContain('Test Memory');
      expect(result.content).toContain('A summary of the memory');
      expect(result.content).not.toContain('Full memory content here');
    });

    it('returns summary fallback when no summary at trust 0.5', () => {
      const memory = createTestMemory({ trust: 0.25, summary: undefined });
      const result = formatMemoryForPrompt(memory, 0.5);

      expect(result.content).toContain('(No summary available)');
    });

    it('returns metadata only at trust 0.25', () => {
      const memory = createTestMemory({ trust: 0.1 });
      const result = formatMemoryForPrompt(memory, 0.25);

      expect(result.trust_tier).toBe('Metadata Only');
      expect(result.content).toContain('[note]');
      expect(result.content).toContain('Tags:');
      expect(result.content).not.toContain('Full memory content here');
      expect(result.content).not.toContain('A summary');
    });

    it('returns existence only at trust 0.0', () => {
      const memory = createTestMemory({ trust: 0.0 });
      const result = formatMemoryForPrompt(memory, 0.0);

      expect(result.trust_tier).toBe('Existence Only');
      expect(result.content).toBe('A memory exists about this topic.');
    });

    it('includes memory_id in all tiers', () => {
      const memory = createTestMemory({ id: 'unique-id' });
      for (const trust of [1.0, 0.75, 0.5, 0.25, 0.0]) {
        const result = formatMemoryForPrompt(memory, trust, true);
        expect(result.memory_id).toBe('unique-id');
      }
    });
  });

  describe('getTrustLevelLabel', () => {
    it('returns Full Access for 1.0', () => {
      expect(getTrustLevelLabel(1.0)).toBe('Full Access');
    });

    it('returns Partial Access for 0.75', () => {
      expect(getTrustLevelLabel(0.75)).toBe('Partial Access');
    });

    it('returns Summary Only for 0.5', () => {
      expect(getTrustLevelLabel(0.5)).toBe('Summary Only');
    });

    it('returns Metadata Only for 0.25', () => {
      expect(getTrustLevelLabel(0.25)).toBe('Metadata Only');
    });

    it('returns Existence Only for 0.0', () => {
      expect(getTrustLevelLabel(0.0)).toBe('Existence Only');
    });

    it('returns correct label for values between tiers', () => {
      expect(getTrustLevelLabel(0.9)).toBe('Partial Access');
      expect(getTrustLevelLabel(0.6)).toBe('Summary Only');
      expect(getTrustLevelLabel(0.3)).toBe('Metadata Only');
      expect(getTrustLevelLabel(0.1)).toBe('Existence Only');
    });
  });

  describe('getTrustInstructions', () => {
    it('returns non-empty instructions for each tier', () => {
      for (const trust of [1.0, 0.75, 0.5, 0.25, 0.0]) {
        const instructions = getTrustInstructions(trust);
        expect(instructions.length).toBeGreaterThan(10);
      }
    });

    it('full access mentions sharing freely', () => {
      expect(getTrustInstructions(1.0)).toContain('full access');
    });

    it('existence only mentions acknowledging only', () => {
      expect(getTrustInstructions(0.0)).toContain('acknowledge');
    });
  });

  describe('redactSensitiveFields', () => {
    it('clears GPS location data', () => {
      const memory = createTestMemory();
      const redacted = redactSensitiveFields(memory, 0.75);

      expect(redacted.location.gps).toBeNull();
      expect(redacted.location.address).toBeNull();
    });

    it('clears context participants and environment', () => {
      const memory = createTestMemory();
      const redacted = redactSensitiveFields(memory, 0.75);

      expect(redacted.context.participants).toBeUndefined();
      expect(redacted.context.environment).toBeUndefined();
      expect(redacted.context.notes).toBeUndefined();
    });

    it('clears references', () => {
      const memory = createTestMemory({ references: ['https://secret.com'] });
      const redacted = redactSensitiveFields(memory, 0.75);

      expect(redacted.references).toBeUndefined();
    });

    it('preserves non-sensitive fields', () => {
      const memory = createTestMemory();
      const redacted = redactSensitiveFields(memory, 0.75);

      expect(redacted.id).toBe(memory.id);
      expect(redacted.content).toBe(memory.content);
      expect(redacted.title).toBe(memory.title);
      expect(redacted.tags).toEqual(memory.tags);
    });

    it('does not mutate the original memory', () => {
      const memory = createTestMemory();
      const originalGps = memory.location.gps;
      redactSensitiveFields(memory, 0.75);

      expect(memory.location.gps).toBe(originalGps);
    });
  });

  describe('isTrustSufficient', () => {
    it('returns true when accessor trust equals memory trust', () => {
      expect(isTrustSufficient(0.5, 0.5)).toBe(true);
    });

    it('returns true when accessor trust exceeds memory trust', () => {
      expect(isTrustSufficient(0.5, 0.75)).toBe(true);
    });

    it('returns false when accessor trust is below memory trust', () => {
      expect(isTrustSufficient(0.75, 0.5)).toBe(false);
    });

    it('handles boundary at 0', () => {
      expect(isTrustSufficient(0.0, 0.0)).toBe(true);
    });

    it('handles boundary at 1', () => {
      expect(isTrustSufficient(1.0, 1.0)).toBe(true);
      expect(isTrustSufficient(1.0, 0.99)).toBe(false);
    });
  });

  describe('resolveEnforcementMode', () => {
    it('defaults to query when undefined', () => {
      expect(resolveEnforcementMode(undefined)).toBe('query');
    });

    it('returns query when specified', () => {
      expect(resolveEnforcementMode('query')).toBe('query');
    });

    it('returns prompt when specified', () => {
      expect(resolveEnforcementMode('prompt')).toBe('prompt');
    });

    it('returns hybrid when specified', () => {
      expect(resolveEnforcementMode('hybrid')).toBe('hybrid');
    });
  });
});
