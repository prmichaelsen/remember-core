/**
 * Debug level configuration for remember-core.
 *
 * Ported from remember-mcp/src/config.ts (DebugLevel enum and debugConfig).
 * Controls verbosity of tool and service logging.
 */

/**
 * Debug levels for tool and service logging.
 */
export enum DebugLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5,
}

/**
 * Parse a debug level string into a DebugLevel enum value.
 *
 * @param level - String representation (e.g. "DEBUG", "info", "TRACE")
 * @returns Matching DebugLevel, defaults to NONE for unrecognized values
 */
export function parseDebugLevel(level: string | undefined): DebugLevel {
  switch (level?.toUpperCase()) {
    case 'TRACE': return DebugLevel.TRACE;
    case 'DEBUG': return DebugLevel.DEBUG;
    case 'INFO': return DebugLevel.INFO;
    case 'WARN': return DebugLevel.WARN;
    case 'ERROR': return DebugLevel.ERROR;
    case 'NONE': return DebugLevel.NONE;
    default: return DebugLevel.NONE;
  }
}

/**
 * Create a debug configuration object from a debug level.
 *
 * @param level - The active debug level
 * @returns Object with the level and an `enabled` helper to check if a given level is active
 */
export function createDebugConfig(level: DebugLevel) {
  return {
    level,
    enabled: (checkLevel: DebugLevel): boolean => level >= checkLevel,
  };
}

export type DebugConfig = ReturnType<typeof createDebugConfig>;
