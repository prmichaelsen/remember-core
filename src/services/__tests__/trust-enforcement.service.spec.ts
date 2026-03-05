import {
  buildTrustFilter,
  formatMemoryForPrompt,
  getTrustLevelLabel,
  getTrustInstructions,
  redactSensitiveFields,
  isTrustSufficient,
  resolveEnforcementMode,
} from '../trust-enforcement.service.js';
import type { Memory } from '../../types/memory.types.js';
import { TrustLevel, TRUST_LABELS } from '../../types/trust.types.js';

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
    trust: TrustLevel.CONFIDENTIAL,
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
    relationship_count: 0,
    rating_sum: 0,
    rating_count: 0,
    rating_bayesian: 3.0,
    rating_avg: null,
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
  describe('TrustLevel constants', () => {
    it('has 5 levels with correct values', () => {
      expect(TrustLevel.PUBLIC).toBe(1);
      expect(TrustLevel.INTERNAL).toBe(2);
      expect(TrustLevel.CONFIDENTIAL).toBe(3);
      expect(TrustLevel.RESTRICTED).toBe(4);
      expect(TrustLevel.SECRET).toBe(5);
    });

    it('levels are in ascending order (higher = more confidential)', () => {
      expect(TrustLevel.SECRET).toBeGreaterThan(TrustLevel.RESTRICTED);
      expect(TrustLevel.RESTRICTED).toBeGreaterThan(TrustLevel.CONFIDENTIAL);
      expect(TrustLevel.CONFIDENTIAL).toBeGreaterThan(TrustLevel.INTERNAL);
      expect(TrustLevel.INTERNAL).toBeGreaterThan(TrustLevel.PUBLIC);
    });
  });

  describe('buildTrustFilter', () => {
    it('creates a filter with lessOrEqual', () => {
      const mockCollection = {
        filter: {
          byProperty: jest.fn().mockReturnValue({
            lessOrEqual: jest.fn().mockReturnValue('mock-filter'),
          }),
        },
      };

      const result = buildTrustFilter(mockCollection, TrustLevel.CONFIDENTIAL);
      expect(mockCollection.filter.byProperty).toHaveBeenCalledWith('trust_score');
      expect(result).toBe('mock-filter');
    });

    it('passes accessor trust level to the filter', () => {
      const lessOrEqual = jest.fn().mockReturnValue('filter');
      const mockCollection = {
        filter: { byProperty: jest.fn().mockReturnValue({ lessOrEqual }) },
      };

      buildTrustFilter(mockCollection, TrustLevel.RESTRICTED);
      expect(lessOrEqual).toHaveBeenCalledWith(TrustLevel.RESTRICTED);
    });
  });

  describe('formatMemoryForPrompt', () => {
    it('returns full content for self-access', () => {
      const memory = createTestMemory({ trust: TrustLevel.CONFIDENTIAL });
      const result = formatMemoryForPrompt(memory, TrustLevel.SECRET, true);

      expect(result.trust_tier).toBe('Secret');
      expect(result.content).toContain('Full memory content here');
      expect(result.content).toContain('Test Memory');
      expect(result.content).toContain('test, important');
    });

    it('returns full content at SECRET accessor level', () => {
      const memory = createTestMemory({ trust: TrustLevel.SECRET });
      const result = formatMemoryForPrompt(memory, TrustLevel.SECRET);

      expect(result.trust_tier).toBe('Secret');
      expect(result.content).toContain('Full memory content here');
    });

    it('returns partial access at RESTRICTED accessor level', () => {
      const memory = createTestMemory({ trust: TrustLevel.CONFIDENTIAL });
      const result = formatMemoryForPrompt(memory, TrustLevel.RESTRICTED);

      expect(result.trust_tier).toBe('Restricted');
      expect(result.content).toContain('Full memory content here');
      expect(result.content).toContain('Tags:');
    });

    it('returns summary only at CONFIDENTIAL accessor level', () => {
      const memory = createTestMemory({ trust: TrustLevel.INTERNAL });
      const result = formatMemoryForPrompt(memory, TrustLevel.CONFIDENTIAL);

      expect(result.trust_tier).toBe('Confidential');
      expect(result.content).toContain('Test Memory');
      expect(result.content).toContain('A summary of the memory');
      expect(result.content).not.toContain('Full memory content here');
    });

    it('returns summary fallback when no summary at CONFIDENTIAL level', () => {
      const memory = createTestMemory({ trust: TrustLevel.INTERNAL, summary: undefined });
      const result = formatMemoryForPrompt(memory, TrustLevel.CONFIDENTIAL);

      expect(result.content).toContain('(No summary available)');
    });

    it('returns metadata only at INTERNAL accessor level', () => {
      const memory = createTestMemory({ trust: TrustLevel.PUBLIC });
      const result = formatMemoryForPrompt(memory, TrustLevel.INTERNAL);

      expect(result.trust_tier).toBe('Internal');
      expect(result.content).toContain('[note]');
      expect(result.content).toContain('Tags:');
      expect(result.content).not.toContain('Full memory content here');
      expect(result.content).not.toContain('A summary');
    });

    it('returns existence only at PUBLIC accessor level', () => {
      const memory = createTestMemory({ trust: TrustLevel.PUBLIC });
      const result = formatMemoryForPrompt(memory, TrustLevel.PUBLIC);

      expect(result.trust_tier).toBe('Public');
      expect(result.content).toBe('A memory exists about this topic.');
    });

    it('includes memory_id in all tiers', () => {
      const memory = createTestMemory({ id: 'unique-id' });
      for (const trust of [TrustLevel.SECRET, TrustLevel.RESTRICTED, TrustLevel.CONFIDENTIAL, TrustLevel.INTERNAL, TrustLevel.PUBLIC] as const) {
        const result = formatMemoryForPrompt(memory, trust, true);
        expect(result.memory_id).toBe('unique-id');
      }
    });
  });

  describe('getTrustLevelLabel', () => {
    it('returns Secret for level 5', () => {
      expect(getTrustLevelLabel(TrustLevel.SECRET)).toBe('Secret');
    });

    it('returns Restricted for level 4', () => {
      expect(getTrustLevelLabel(TrustLevel.RESTRICTED)).toBe('Restricted');
    });

    it('returns Confidential for level 3', () => {
      expect(getTrustLevelLabel(TrustLevel.CONFIDENTIAL)).toBe('Confidential');
    });

    it('returns Internal for level 2', () => {
      expect(getTrustLevelLabel(TrustLevel.INTERNAL)).toBe('Internal');
    });

    it('returns Public for level 1', () => {
      expect(getTrustLevelLabel(TrustLevel.PUBLIC)).toBe('Public');
    });
  });

  describe('getTrustInstructions', () => {
    it('returns non-empty instructions for each level', () => {
      for (const trust of [TrustLevel.SECRET, TrustLevel.RESTRICTED, TrustLevel.CONFIDENTIAL, TrustLevel.INTERNAL, TrustLevel.PUBLIC] as const) {
        const instructions = getTrustInstructions(trust);
        expect(instructions.length).toBeGreaterThan(10);
      }
    });

    it('full access mentions sharing freely', () => {
      expect(getTrustInstructions(TrustLevel.SECRET)).toContain('full access');
    });

    it('existence only mentions acknowledging only', () => {
      expect(getTrustInstructions(TrustLevel.PUBLIC)).toContain('acknowledge');
    });
  });

  describe('redactSensitiveFields', () => {
    it('clears GPS location data', () => {
      const memory = createTestMemory();
      const redacted = redactSensitiveFields(memory);

      expect(redacted.location.gps).toBeNull();
      expect(redacted.location.address).toBeNull();
    });

    it('clears context participants and environment', () => {
      const memory = createTestMemory();
      const redacted = redactSensitiveFields(memory);

      expect(redacted.context.participants).toBeUndefined();
      expect(redacted.context.environment).toBeUndefined();
      expect(redacted.context.notes).toBeUndefined();
    });

    it('clears references', () => {
      const memory = createTestMemory({ references: ['https://secret.com'] });
      const redacted = redactSensitiveFields(memory);

      expect(redacted.references).toBeUndefined();
    });

    it('preserves non-sensitive fields', () => {
      const memory = createTestMemory();
      const redacted = redactSensitiveFields(memory);

      expect(redacted.id).toBe(memory.id);
      expect(redacted.content).toBe(memory.content);
      expect(redacted.title).toBe(memory.title);
      expect(redacted.tags).toEqual(memory.tags);
    });

    it('does not mutate the original memory', () => {
      const memory = createTestMemory();
      const originalGps = memory.location.gps;
      redactSensitiveFields(memory);

      expect(memory.location.gps).toBe(originalGps);
    });
  });

  describe('isTrustSufficient', () => {
    it('returns true when accessor trust equals memory trust', () => {
      expect(isTrustSufficient(TrustLevel.CONFIDENTIAL, TrustLevel.CONFIDENTIAL)).toBe(true);
    });

    it('returns true when accessor trust exceeds memory trust', () => {
      expect(isTrustSufficient(TrustLevel.CONFIDENTIAL, TrustLevel.RESTRICTED)).toBe(true);
    });

    it('returns false when accessor trust is below memory trust', () => {
      expect(isTrustSufficient(TrustLevel.RESTRICTED, TrustLevel.CONFIDENTIAL)).toBe(false);
    });

    it('handles boundary at PUBLIC (1)', () => {
      expect(isTrustSufficient(TrustLevel.PUBLIC, TrustLevel.PUBLIC)).toBe(true);
    });

    it('handles boundary at SECRET (5)', () => {
      expect(isTrustSufficient(TrustLevel.SECRET, TrustLevel.SECRET)).toBe(true);
      expect(isTrustSufficient(TrustLevel.SECRET, TrustLevel.RESTRICTED)).toBe(false);
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
