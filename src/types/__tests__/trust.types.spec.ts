import { normalizeTrustScore, TrustLevel, isValidTrustLevel } from '../trust.types';

describe('normalizeTrustScore', () => {
  describe('canonical float values (inverted mapping)', () => {
    it('maps 0.0 (old Secret) to 5 (new Secret)', () => {
      expect(normalizeTrustScore(0.0)).toBe(TrustLevel.SECRET);
    });

    it('maps 0.25 (old Restricted) to 4 (new Restricted)', () => {
      expect(normalizeTrustScore(0.25)).toBe(TrustLevel.RESTRICTED);
    });

    it('maps 0.5 (old Confidential) to 3 (new Confidential)', () => {
      expect(normalizeTrustScore(0.5)).toBe(TrustLevel.CONFIDENTIAL);
    });

    it('maps 0.75 (old Internal) to 2 (new Internal)', () => {
      expect(normalizeTrustScore(0.75)).toBe(TrustLevel.INTERNAL);
    });

    it('maps 1.0 (old Public) to 1 (new Public)', () => {
      expect(normalizeTrustScore(1)).toBe(TrustLevel.PUBLIC);
    });
  });

  describe('already-migrated integer values (passthrough)', () => {
    it('passes through 1 (Public)', () => {
      expect(normalizeTrustScore(1)).toBe(TrustLevel.PUBLIC);
    });

    it('passes through 2 (Internal)', () => {
      expect(normalizeTrustScore(2)).toBe(TrustLevel.INTERNAL);
    });

    it('passes through 3 (Confidential)', () => {
      expect(normalizeTrustScore(3)).toBe(TrustLevel.CONFIDENTIAL);
    });

    it('passes through 4 (Restricted)', () => {
      expect(normalizeTrustScore(4)).toBe(TrustLevel.RESTRICTED);
    });

    it('passes through 5 (Secret)', () => {
      expect(normalizeTrustScore(5)).toBe(TrustLevel.SECRET);
    });
  });

  describe('intermediate float values', () => {
    it('maps 0.33 to Restricted (4)', () => {
      expect(normalizeTrustScore(0.33)).toBe(TrustLevel.RESTRICTED);
    });

    it('maps 0.6 to Confidential (3)', () => {
      expect(normalizeTrustScore(0.6)).toBe(TrustLevel.CONFIDENTIAL);
    });

    it('maps 0.9 to Public (1)', () => {
      expect(normalizeTrustScore(0.9)).toBe(TrustLevel.PUBLIC);
    });

    it('maps 0.1 to Secret (5)', () => {
      expect(normalizeTrustScore(0.1)).toBe(TrustLevel.SECRET);
    });
  });

  describe('null/undefined handling', () => {
    it('returns INTERNAL (2) for null', () => {
      expect(normalizeTrustScore(null)).toBe(TrustLevel.INTERNAL);
    });

    it('returns INTERNAL (2) for undefined', () => {
      expect(normalizeTrustScore(undefined)).toBe(TrustLevel.INTERNAL);
    });
  });
});

describe('isValidTrustLevel', () => {
  it('returns true for valid integers 1-5', () => {
    expect(isValidTrustLevel(1)).toBe(true);
    expect(isValidTrustLevel(5)).toBe(true);
  });

  it('returns false for floats', () => {
    expect(isValidTrustLevel(0.5)).toBe(false);
  });

  it('returns false for out-of-range', () => {
    expect(isValidTrustLevel(0)).toBe(false);
    expect(isValidTrustLevel(6)).toBe(false);
  });
});
