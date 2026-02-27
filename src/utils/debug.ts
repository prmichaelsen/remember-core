/**
 * Debug logging utility for remember-core.
 *
 * Ported from remember-mcp/src/utils/debug.ts.
 * Design: DebugLogger takes a Logger instance and DebugConfig, no hard dependencies.
 */

import type { Logger } from './logger.js';
import type { DebugConfig } from '../config/debug.js';
import { DebugLevel } from '../config/debug.js';

export interface DebugContext {
  tool: string;
  userId?: string;
  operation?: string;
  [key: string]: unknown;
}

export class DebugLogger {
  private context: DebugContext;
  private logger: Logger;
  private debugConfig: DebugConfig;

  constructor(context: DebugContext, logger: Logger, debugConfig: DebugConfig) {
    this.context = context;
    this.logger = logger;
    this.debugConfig = debugConfig;
  }

  trace(message: string, data?: Record<string, unknown>): void {
    if (this.debugConfig.enabled(DebugLevel.TRACE)) {
      this.logger.debug(`[TRACE] ${message}`, {
        ...this.context,
        ...data,
        debugLevel: 'TRACE',
      });
    }
  }

  debug(message: string, data?: Record<string, unknown>): void {
    if (this.debugConfig.enabled(DebugLevel.DEBUG)) {
      this.logger.debug(`[DEBUG] ${message}`, {
        ...this.context,
        ...data,
        debugLevel: 'DEBUG',
      });
    }
  }

  info(message: string, data?: Record<string, unknown>): void {
    if (this.debugConfig.enabled(DebugLevel.INFO)) {
      this.logger.info(`[INFO] ${message}`, {
        ...this.context,
        ...data,
        debugLevel: 'INFO',
      });
    }
  }

  warn(message: string, data?: Record<string, unknown>): void {
    if (this.debugConfig.enabled(DebugLevel.WARN)) {
      this.logger.warn(`[WARN] ${message}`, {
        ...this.context,
        ...data,
        debugLevel: 'WARN',
      });
    }
  }

  error(message: string, data?: Record<string, unknown>): void {
    if (this.debugConfig.enabled(DebugLevel.ERROR)) {
      this.logger.error(`[ERROR] ${message}`, {
        ...this.context,
        ...data,
        debugLevel: 'ERROR',
      });
    }
  }

  /**
   * Dump full object (TRACE only).
   * Use with caution — may expose sensitive data.
   */
  dump(label: string, obj: unknown): void {
    if (this.debugConfig.enabled(DebugLevel.TRACE)) {
      this.logger.debug(`[DUMP] ${label}`, {
        ...this.context,
        dump: JSON.stringify(obj, null, 2),
        debugLevel: 'TRACE',
      });
    }
  }

  /**
   * Time an async operation (DEBUG and above).
   * Logs start, completion, and duration.
   */
  async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!this.debugConfig.enabled(DebugLevel.DEBUG)) {
      return fn();
    }

    const start = Date.now();
    this.debug(`${label} - Starting`);

    try {
      const result = await fn();
      const duration = Date.now() - start;
      this.debug(`${label} - Completed`, { durationMs: duration });
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.error(`${label} - Failed`, {
        durationMs: duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/**
 * Create a debug logger with context.
 *
 * @param context - Context information (tool name, userId, operation, etc.)
 * @param logger - Logger instance to use for output
 * @param debugConfig - Debug configuration controlling verbosity
 * @returns DebugLogger instance
 */
export function createDebugLogger(
  context: DebugContext,
  logger: Logger,
  debugConfig: DebugConfig,
): DebugLogger {
  return new DebugLogger(context, logger, debugConfig);
}
