import {
  validateTrustAssignment,
  suggestTrustLevel,
} from '../trust-validator.service.js';

describe('TrustValidatorService', () => {
  describe('validateTrustAssignment', () => {
    it('accepts 0 as valid', () => {
      const result = validateTrustAssignment(0);
      expect(result.valid).toBe(true);
    });

    it('accepts 0.5 as valid without warning', () => {
      const result = validateTrustAssignment(0.5);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('accepts 1.0 as valid without warning', () => {
      const result = validateTrustAssignment(1.0);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it('rejects negative values', () => {
      const result = validateTrustAssignment(-0.1);
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('-0.1');
    });

    it('rejects values above 1', () => {
      const result = validateTrustAssignment(1.1);
      expect(result.valid).toBe(false);
      expect(result.warning).toContain('1.1');
    });

    it('warns for values below 0.25 (very restrictive)', () => {
      const result = validateTrustAssignment(0.1);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain('restrictive');
    });

    it('warns for trust 0 (existence only)', () => {
      const result = validateTrustAssignment(0);
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('restrictive');
    });

    it('does not warn for 0.25 (boundary)', () => {
      const result = validateTrustAssignment(0.25);
      expect(result.valid).toBe(true);
      expect(result.warning).toBeUndefined();
    });
  });

  describe('suggestTrustLevel', () => {
    describe('tag overrides', () => {
      it('returns 0.1 for private tag', () => {
        expect(suggestTrustLevel('note', ['private'])).toBe(0.1);
      });

      it('returns 0.1 for secret tag', () => {
        expect(suggestTrustLevel('note', ['secret'])).toBe(0.1);
      });

      it('returns 1.0 for public tag', () => {
        expect(suggestTrustLevel('note', ['public'])).toBe(1.0);
      });

      it('is case-insensitive for tags', () => {
        expect(suggestTrustLevel('note', ['PRIVATE'])).toBe(0.1);
        expect(suggestTrustLevel('note', ['Public'])).toBe(1.0);
      });

      it('private tag overrides content type', () => {
        expect(suggestTrustLevel('journal', ['private'])).toBe(0.1);
      });
    });

    describe('content type suggestions', () => {
      it('returns 0.75 for personal types', () => {
        expect(suggestTrustLevel('journal')).toBe(0.75);
        expect(suggestTrustLevel('memory')).toBe(0.75);
        expect(suggestTrustLevel('event')).toBe(0.75);
      });

      it('returns 0.5 for system types', () => {
        expect(suggestTrustLevel('system')).toBe(0.5);
        expect(suggestTrustLevel('audit')).toBe(0.5);
        expect(suggestTrustLevel('action')).toBe(0.5);
        expect(suggestTrustLevel('history')).toBe(0.5);
      });

      it('returns 0.5 for business types', () => {
        expect(suggestTrustLevel('invoice')).toBe(0.5);
        expect(suggestTrustLevel('contract')).toBe(0.5);
      });

      it('returns 0.5 for communication types', () => {
        expect(suggestTrustLevel('email')).toBe(0.5);
        expect(suggestTrustLevel('conversation')).toBe(0.5);
        expect(suggestTrustLevel('meeting')).toBe(0.5);
      });

      it('returns 0.75 for ghost type', () => {
        expect(suggestTrustLevel('ghost')).toBe(0.75);
      });

      it('returns 0.25 for default/unknown types', () => {
        expect(suggestTrustLevel('note')).toBe(0.25);
        expect(suggestTrustLevel('code')).toBe(0.25);
        expect(suggestTrustLevel('bookmark')).toBe(0.25);
      });
    });

    describe('no tags', () => {
      it('uses content type when tags are undefined', () => {
        expect(suggestTrustLevel('journal')).toBe(0.75);
      });

      it('uses content type when tags are empty', () => {
        expect(suggestTrustLevel('journal', [])).toBe(0.75);
      });
    });
  });
});
