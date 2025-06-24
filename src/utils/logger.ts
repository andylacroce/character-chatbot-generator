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

/**
 * Helper for structured event logging. Always includes the event field.
 * @param {"info"|"warn"|"error"} level - Log level
 * @param {string} event - Event name (required)
 * @param {string} message - Log message
 * @param {Record<string, unknown>} [meta] - Additional metadata
 */
export function logEvent(level: "info" | "warn" | "error", event: string, message: string, meta?: Record<string, unknown>) {
  loggerInstance.log(level, message, { event, ...(meta || {}) });
}

/**
 * Truncates a string to a max length, adding ellipsis if needed.
 */
export function truncate(str: string, max = 100): string {
  if (typeof str !== 'string') return str;
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/**
 * Sanitizes log metadata for readability: truncates long fields, removes large objects.
 * Use this before passing metadata to logEvent.
 */
export function sanitizeLogMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (typeof value === 'string' && value.length > 120) {
      result[key] = truncate(value, 120);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // For objects, only keep shallow keys or a summary
      result[key] = '[Object]';
    } else if (Array.isArray(value) && value.length > 5) {
      result[key] = `[Array(${value.length})]`;
    } else {
      result[key] = value;
    }
  }
  return result;
}

export default loggerInstance;
