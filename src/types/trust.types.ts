/**
 * Trust level types — discrete 1-5 integer scale with named labels.
 *
 * Higher value = more confidential (requires more trust to access).
 * Access rule: accessor_level >= memory_level
 *
 * Aligned with industry classification standards (ISO 27001, NIST FIPS 199).
 */

/** Discrete trust level values (1-5 integer) */
export const TrustLevel = {
  /** Anyone can see this, including strangers */
  PUBLIC: 1,
  /** Friends and known users */
  INTERNAL: 2,
  /** Trusted friends only */
  CONFIDENTIAL: 3,
  /** Close/intimate contacts only */
  RESTRICTED: 4,
  /** Owner only (or explicitly granted) */
  SECRET: 5,
} as const;

/** Trust level type — one of the 5 discrete integer values */
export type TrustLevel = (typeof TrustLevel)[keyof typeof TrustLevel];

/** Human-readable labels for each trust level */
export const TRUST_LABELS: Record<TrustLevel, string> = {
  [TrustLevel.PUBLIC]: 'Public',
  [TrustLevel.INTERNAL]: 'Internal',
  [TrustLevel.CONFIDENTIAL]: 'Confidential',
  [TrustLevel.RESTRICTED]: 'Restricted',
  [TrustLevel.SECRET]: 'Secret',
} as const;

/** All valid trust level values, ordered from least to most confidential */
export const ALL_TRUST_LEVELS: readonly TrustLevel[] = [
  TrustLevel.PUBLIC,
  TrustLevel.INTERNAL,
  TrustLevel.CONFIDENTIAL,
  TrustLevel.RESTRICTED,
  TrustLevel.SECRET,
] as const;

/** Check if a value is a valid TrustLevel */
export function isValidTrustLevel(value: unknown): value is TrustLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}
