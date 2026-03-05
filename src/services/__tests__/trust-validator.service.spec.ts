import {
  validateTrustAssignment,
  suggestTrustLevel,
} from '../trust-validator.service.js';
import { TrustLevel } from '../../types/trust.types.js';

describe('TrustValidatorService', () => {
  describe('validateTrustAssignment', () => {
    it('accepts PUBLIC (1) as valid without warning', () => {
      const result = validateTrustAssignment(TrustLevel.PUBLIC);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('accepts INTERNAL (2) as valid without warning', () => {
      const result = validateTrustAssignment(TrustLevel.INTERNAL);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('accepts CONFIDENTIAL (3) as valid without warning', () => {
      const result = validateTrustAssignment(TrustLevel.CONFIDENTIAL);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('warns for RESTRICTED (4) — very restrictive', () => {
      const result = validateTrustAssignment(TrustLevel.RESTRICTED);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('restrictive');
    });

    it('warns for SECRET (5) — very restrictive', () => {
      const result = validateTrustAssignment(TrustLevel.SECRET);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('restrictive');
    });

    it('rejects 0 (below range)', () => {
      const result = validateTrustAssignment(0);
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('0');
    });

    it('rejects 6 (above range)', () => {
      const result = validateTrustAssignment(6);
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('6');
    });

    it('rejects negative values', () => {
      const result = validateTrustAssignment(-1);
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('-1');
    });

    it('rejects float values', () => {
      const result = validateTrustAssignment(2.5);
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('2.5');
    });
  });

  describe('suggestTrustLevel', () => {
    describe('tag overrides', () => {
      it('returns SECRET for private tag', () => {
        expect(suggestTrustLevel('note', ['private'])).toBe(TrustLevel.SECRET);
      });

      it('returns SECRET for secret tag', () => {
        expect(suggestTrustLevel('note', ['secret'])).toBe(TrustLevel.SECRET);
      });

      it('returns PUBLIC for public tag', () => {
        expect(suggestTrustLevel('note', ['public'])).toBe(TrustLevel.PUBLIC);
      });

      it('is case-insensitive for tags', () => {
        expect(suggestTrustLevel('note', ['PRIVATE'])).toBe(TrustLevel.SECRET);
        expect(suggestTrustLevel('note', ['Public'])).toBe(TrustLevel.PUBLIC);
      });

      it('private tag overrides content type', () => {
        expect(suggestTrustLevel('journal', ['private'])).toBe(TrustLevel.SECRET);
      });
    });

    describe('content type suggestions', () => {
      it('returns RESTRICTED for personal types', () => {
        expect(suggestTrustLevel('journal')).toBe(TrustLevel.RESTRICTED);
        expect(suggestTrustLevel('memory')).toBe(TrustLevel.RESTRICTED);
        expect(suggestTrustLevel('event')).toBe(TrustLevel.RESTRICTED);
      });

      it('returns CONFIDENTIAL for system types', () => {
        expect(suggestTrustLevel('system')).toBe(TrustLevel.CONFIDENTIAL);
        expect(suggestTrustLevel('audit')).toBe(TrustLevel.CONFIDENTIAL);
        expect(suggestTrustLevel('action')).toBe(TrustLevel.CONFIDENTIAL);
        expect(suggestTrustLevel('history')).toBe(TrustLevel.CONFIDENTIAL);
      });

      it('returns CONFIDENTIAL for business types', () => {
        expect(suggestTrustLevel('invoice')).toBe(TrustLevel.CONFIDENTIAL);
        expect(suggestTrustLevel('contract')).toBe(TrustLevel.CONFIDENTIAL);
      });

      it('returns CONFIDENTIAL for communication types', () => {
        expect(suggestTrustLevel('email')).toBe(TrustLevel.CONFIDENTIAL);
        expect(suggestTrustLevel('conversation')).toBe(TrustLevel.CONFIDENTIAL);
        expect(suggestTrustLevel('meeting')).toBe(TrustLevel.CONFIDENTIAL);
      });

      it('returns RESTRICTED for ghost type', () => {
        expect(suggestTrustLevel('ghost')).toBe(TrustLevel.RESTRICTED);
      });

      it('returns INTERNAL for default/unknown types', () => {
        expect(suggestTrustLevel('note')).toBe(TrustLevel.INTERNAL);
        expect(suggestTrustLevel('code')).toBe(TrustLevel.INTERNAL);
        expect(suggestTrustLevel('bookmark')).toBe(TrustLevel.INTERNAL);
      });
    });

    describe('no tags', () => {
      it('uses content type when tags are undefined', () => {
        expect(suggestTrustLevel('journal')).toBe(TrustLevel.RESTRICTED);
      });

      it('uses content type when tags are empty', () => {
        expect(suggestTrustLevel('journal', [])).toBe(TrustLevel.RESTRICTED);
      });
    });
  });
});
