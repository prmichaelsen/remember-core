import {
  shouldFlag,
  generateFlagReason,
  shouldBlockReflag,
  evaluateAndFlag,
  dismissFlag,
  getActiveTrustFlags,
  TRUST_FLAG_CONFIG,
  type TrustFlagInput,
  type TrustLevelFlag,
  type FirestoreAdapter,
} from './rem.trust-flagging.js';
import { TrustLevel } from '../types/trust.types.js';

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeInput(overrides?: Partial<TrustFlagInput>): TrustFlagInput {
  return {
    memory_id: 'm1',
    user_id: 'user1',
    collection_id: 'col1',
    feel_trauma: 0.3,
    feel_vulnerability: 0.3,
    feel_shame: 0.3,
    trust_score: TrustLevel.PUBLIC,
    ...overrides,
  };
}

function makeFlag(overrides?: Partial<TrustLevelFlag>): TrustLevelFlag {
  return {
    id: 'flag1',
    memory_id: 'm1',
    user_id: 'user1',
    collection_id: 'col1',
    type: 'trust_level_concern',
    reason: 'Test reason',
    trigger_scores: { feel_trauma: 0.5, feel_vulnerability: 0.5, feel_shame: 0.5 },
    current_trust_level: TrustLevel.PUBLIC,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    dismissed_at: null,
    dismissed_reason: null,
    ...overrides,
  };
}

function createMockFirestore(existingFlags: TrustLevelFlag[] = []): FirestoreAdapter & {
  createFlag: jest.Mock;
  updateFlag: jest.Mock;
  getFlags: jest.Mock;
  getActiveFlags: jest.Mock;
} {
  return {
    getFlags: jest.fn().mockResolvedValue(existingFlags),
    getActiveFlags: jest.fn().mockResolvedValue(existingFlags.filter(f => f.status === 'active')),
    createFlag: jest.fn().mockResolvedValue('new-flag-id'),
    updateFlag: jest.fn().mockResolvedValue(undefined),
  };
}

// ─── shouldFlag ───────────────────────────────────────────────────────────

describe('shouldFlag', () => {
  it('flags memory with high feel_trauma at Public trust', () => {
    expect(shouldFlag(makeInput({ feel_trauma: 0.9 }))).toBe(true);
  });

  it('flags memory with high feel_vulnerability at Internal trust', () => {
    expect(shouldFlag(makeInput({ feel_vulnerability: 0.8, trust_score: TrustLevel.INTERNAL }))).toBe(true);
  });

  it('flags memory with high feel_shame at Public trust', () => {
    expect(shouldFlag(makeInput({ feel_shame: 0.75 }))).toBe(true);
  });

  it('flags when combined average >= 0.6 even if individual scores < 0.7', () => {
    expect(shouldFlag(makeInput({
      feel_trauma: 0.65,
      feel_vulnerability: 0.65,
      feel_shame: 0.5,
    }))).toBe(true);
  });

  it('does NOT flag when trust level >= 3 (Confidential)', () => {
    expect(shouldFlag(makeInput({ feel_trauma: 0.95, trust_score: TrustLevel.CONFIDENTIAL }))).toBe(false);
  });

  it('does NOT flag when trust level is Restricted', () => {
    expect(shouldFlag(makeInput({ feel_trauma: 0.95, trust_score: TrustLevel.RESTRICTED }))).toBe(false);
  });

  it('does NOT flag when trust level is Secret', () => {
    expect(shouldFlag(makeInput({ feel_trauma: 0.95, trust_score: TrustLevel.SECRET }))).toBe(false);
  });

  it('does NOT flag when all scores below threshold and average below 0.6', () => {
    expect(shouldFlag(makeInput({
      feel_trauma: 0.3,
      feel_vulnerability: 0.3,
      feel_shame: 0.3,
    }))).toBe(false);
  });
});

// ─── generateFlagReason ───────────────────────────────────────────────────

describe('generateFlagReason', () => {
  it('generates trauma-specific reason', () => {
    const reason = generateFlagReason(makeInput({ feel_trauma: 0.9 }));
    expect(reason).toContain('traumatic');
    expect(reason).toContain('Public');
  });

  it('generates vulnerability-specific reason', () => {
    const reason = generateFlagReason(makeInput({ feel_vulnerability: 0.8 }));
    expect(reason).toContain('vulnerability');
  });

  it('generates shame-specific reason', () => {
    const reason = generateFlagReason(makeInput({ feel_shame: 0.75 }));
    expect(reason).toContain('sensitive content');
  });

  it('generates combined reason when no single score dominates', () => {
    const reason = generateFlagReason(makeInput({
      feel_trauma: 0.65,
      feel_vulnerability: 0.65,
      feel_shame: 0.5,
    }));
    expect(reason).toContain('emotionally sensitive');
    expect(reason).toContain('Public');
  });

  it('includes Internal trust label when appropriate', () => {
    const reason = generateFlagReason(makeInput({
      feel_trauma: 0.9,
      trust_score: TrustLevel.INTERNAL,
    }));
    expect(reason).toContain('Internal');
  });
});

// ─── shouldBlockReflag ────────────────────────────────────────────────────

describe('shouldBlockReflag', () => {
  it('blocks re-flagging when scores have not increased', () => {
    const dismissed = makeFlag({
      status: 'dismissed',
      trigger_scores: { feel_trauma: 0.7, feel_vulnerability: 0.5, feel_shame: 0.5 },
    });
    expect(shouldBlockReflag(dismissed, { feel_trauma: 0.7, feel_vulnerability: 0.5, feel_shame: 0.5 })).toBe(true);
  });

  it('allows re-flagging when trauma increased by >= 0.2', () => {
    const dismissed = makeFlag({
      status: 'dismissed',
      trigger_scores: { feel_trauma: 0.6, feel_vulnerability: 0.5, feel_shame: 0.5 },
    });
    expect(shouldBlockReflag(dismissed, { feel_trauma: 0.8, feel_vulnerability: 0.5, feel_shame: 0.5 })).toBe(false);
  });

  it('allows re-flagging when vulnerability increased by >= 0.2', () => {
    const dismissed = makeFlag({
      status: 'dismissed',
      trigger_scores: { feel_trauma: 0.5, feel_vulnerability: 0.5, feel_shame: 0.5 },
    });
    expect(shouldBlockReflag(dismissed, { feel_trauma: 0.5, feel_vulnerability: 0.75, feel_shame: 0.5 })).toBe(false);
  });

  it('blocks re-flagging when increase is less than 0.2', () => {
    const dismissed = makeFlag({
      status: 'dismissed',
      trigger_scores: { feel_trauma: 0.7, feel_vulnerability: 0.5, feel_shame: 0.5 },
    });
    expect(shouldBlockReflag(dismissed, { feel_trauma: 0.85, feel_vulnerability: 0.5, feel_shame: 0.5 })).toBe(true);
  });
});

// ─── evaluateAndFlag ──────────────────────────────────────────────────────

describe('evaluateAndFlag', () => {
  it('creates a flag for a public memory with high trauma', async () => {
    const firestore = createMockFirestore();
    const input = makeInput({ feel_trauma: 0.9 });

    const flagId = await evaluateAndFlag(firestore, input);
    expect(flagId).toBe('new-flag-id');
    expect(firestore.createFlag).toHaveBeenCalledTimes(1);

    const created = firestore.createFlag.mock.calls[0][0];
    expect(created.type).toBe('trust_level_concern');
    expect(created.memory_id).toBe('m1');
    expect(created.status).toBe('active');
    expect(created.trigger_scores.feel_trauma).toBe(0.9);
    expect(created.reason).toContain('traumatic');
  });

  it('returns null when memory should not be flagged', async () => {
    const firestore = createMockFirestore();
    const input = makeInput({ feel_trauma: 0.1, feel_vulnerability: 0.1, feel_shame: 0.1 });

    const flagId = await evaluateAndFlag(firestore, input);
    expect(flagId).toBeNull();
    expect(firestore.createFlag).not.toHaveBeenCalled();
  });

  it('returns null when active flag already exists', async () => {
    const existingFlag = makeFlag({ status: 'active' });
    const firestore = createMockFirestore([existingFlag]);
    const input = makeInput({ feel_trauma: 0.9 });

    const flagId = await evaluateAndFlag(firestore, input);
    expect(flagId).toBeNull();
    expect(firestore.createFlag).not.toHaveBeenCalled();
  });

  it('blocks re-flagging when dismissed flag exists and scores not increased enough', async () => {
    const dismissedFlag = makeFlag({
      status: 'dismissed',
      trigger_scores: { feel_trauma: 0.8, feel_vulnerability: 0.5, feel_shame: 0.5 },
    });
    const firestore = createMockFirestore([dismissedFlag]);
    const input = makeInput({ feel_trauma: 0.9, feel_vulnerability: 0.5, feel_shame: 0.5 });

    const flagId = await evaluateAndFlag(firestore, input);
    expect(flagId).toBeNull();
  });

  it('allows re-flagging when dismissed flag exists and scores increased significantly', async () => {
    const dismissedFlag = makeFlag({
      status: 'dismissed',
      trigger_scores: { feel_trauma: 0.5, feel_vulnerability: 0.5, feel_shame: 0.5 },
    });
    const firestore = createMockFirestore([dismissedFlag]);
    const input = makeInput({ feel_trauma: 0.9, feel_vulnerability: 0.5, feel_shame: 0.5 });

    const flagId = await evaluateAndFlag(firestore, input);
    expect(flagId).toBe('new-flag-id');
    expect(firestore.createFlag).toHaveBeenCalledTimes(1);
  });

  it('stores correct Firestore record schema', async () => {
    const firestore = createMockFirestore();
    const input = makeInput({ feel_trauma: 0.9, trust_score: TrustLevel.INTERNAL });

    await evaluateAndFlag(firestore, input);

    const created = firestore.createFlag.mock.calls[0][0];
    expect(created.collection_id).toBe('col1');
    expect(created.user_id).toBe('user1');
    expect(created.current_trust_level).toBe(TrustLevel.INTERNAL);
    expect(created.dismissed_at).toBeNull();
    expect(created.dismissed_reason).toBeNull();
    expect(created.created_at).toBeDefined();
  });
});

// ─── dismissFlag ──────────────────────────────────────────────────────────

describe('dismissFlag', () => {
  it('sets status to dismissed with timestamp', async () => {
    const firestore = createMockFirestore();
    await dismissFlag(firestore, 'col1', 'flag1', 'Not concerned');

    expect(firestore.updateFlag).toHaveBeenCalledWith('col1', 'flag1', expect.objectContaining({
      status: 'dismissed',
      dismissed_reason: 'Not concerned',
    }));
    const update = firestore.updateFlag.mock.calls[0][2];
    expect(update.dismissed_at).toBeDefined();
  });

  it('sets dismissed_reason to null when not provided', async () => {
    const firestore = createMockFirestore();
    await dismissFlag(firestore, 'col1', 'flag1');

    const update = firestore.updateFlag.mock.calls[0][2];
    expect(update.dismissed_reason).toBeNull();
  });
});

// ─── getActiveTrustFlags ──────────────────────────────────────────────────

describe('getActiveTrustFlags', () => {
  it('returns only active flags for a collection', async () => {
    const flags = [
      makeFlag({ id: 'f1', status: 'active' }),
      makeFlag({ id: 'f2', status: 'dismissed' }),
    ];
    const firestore = createMockFirestore(flags);

    const result = await getActiveTrustFlags(firestore, 'col1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('f1');
  });

  it('returns empty array when no active flags', async () => {
    const firestore = createMockFirestore([]);
    const result = await getActiveTrustFlags(firestore, 'col1');
    expect(result).toEqual([]);
  });
});
