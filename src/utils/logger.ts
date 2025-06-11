import winston from "winston";
import { v4 as uuidv4 } from "uuid";

/**
 * Winston logger instance for application-wide logging.
 *
 * Provides log formatting, request ID tracing, and log level control.
 *
 * @module logger
 */
if (typeof globalThis.setImmediate === "undefined") {
  (globalThis as Record<string, unknown>).setImmediate = (fn: (...args: unknown[]) => void, ...args: unknown[]) => setTimeout(fn, 0, ...args);
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaString = Object.keys(meta).length ? JSON.stringify(meta) : "";
      return `[${timestamp}] [${level.toUpperCase()}]: ${message} ${metaString}`;
    }),
  ),
  transports: [new winston.transports.Console()],
});

/**
 * Generates a unique request ID for tracing logs across services.
 * @returns {string} A UUID string.
 */
export function generateRequestId() {
  return uuidv4();
}

const loggerInstance = logger as unknown as winston.Logger;

/**
 * Logs a message at the specified level with optional metadata.
 * @param {string} level - Log level (e.g., 'info', 'error').
 * @param {string} message - Log message.
 * @param {Record<string, unknown>} [meta] - Optional metadata.
 */
export function log(level: string, message: string, meta?: Record<string, unknown>) {
  loggerInstance.log(level, message, meta);
}

export default loggerInstance;
