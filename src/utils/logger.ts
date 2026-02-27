/**
 * Structured logger for remember-core.
 *
 * Ported from remember-mcp/src/utils/logger.ts.
 * Design: createLogger() factory takes a log level string, returning a logger instance.
 * No hard dependency on config module — consumers provide the log level.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

/**
 * Create a structured logger with the given minimum log level.
 *
 * @param logLevel - Minimum level to output (default: 'info')
 * @returns Logger instance
 */
export function createLogger(logLevel: LogLevel = 'info'): Logger {
  const currentLevel = LOG_LEVELS[logLevel] ?? LOG_LEVELS.info;

  function shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= currentLevel;
  }

  return {
    debug(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('debug')) {
        if (data) {
          console.debug(JSON.stringify({ level: 'DEBUG', message, ...data }));
        } else {
          console.debug(`[DEBUG] ${message}`);
        }
      }
    },

    info(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('info')) {
        if (data) {
          console.info(JSON.stringify({ level: 'INFO', message, ...data }));
        } else {
          console.info(`[INFO] ${message}`);
        }
      }
    },

    warn(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('warn')) {
        if (data) {
          console.warn(JSON.stringify({ level: 'WARN', message, ...data }));
        } else {
          console.warn(`[WARN] ${message}`);
        }
      }
    },

    error(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('error')) {
        if (data) {
          console.error(JSON.stringify({ level: 'ERROR', message, ...data }));
        } else {
          console.error(`[ERROR] ${message}`);
        }
      }
    },
  };
}
