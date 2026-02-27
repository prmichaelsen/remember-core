// src/services/base.service.ts
// Pattern: Service Base (core-sdk.service-base.md)

/**
 * Minimal structured logger interface.
 * Wire in winston, pino, or any other logger at the container level.
 */
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Abstract base class for all services.
 *
 * Provides:
 * - Constructor injection of config and logger
 * - Optional initialize/shutdown lifecycle hooks
 * - Consistent naming (className from constructor.name)
 *
 * @example
 * class UserService extends BaseService<ServiceConfig> {
 *   constructor(config: ServiceConfig, logger: Logger) {
 *     super(config, logger);
 *   }
 *
 *   async initialize(): Promise<void> {
 *     // connect to DB, warm up caches, etc.
 *   }
 * }
 */
export abstract class BaseService<TConfig = unknown> {
  protected readonly name: string;

  constructor(
    protected readonly config: TConfig,
    protected readonly logger: Logger
  ) {
    this.name = this.constructor.name;
  }

  /**
   * Called once when the application starts.
   * Override to connect to databases, warm up caches, or validate config.
   */
  async initialize(): Promise<void> {
    // No-op by default
  }

  /**
   * Called once when the application shuts down.
   * Override to close connections, flush buffers, or clean up resources.
   */
  async shutdown(): Promise<void> {
    // No-op by default
  }
}
