import { v4 as uuidv4 } from "uuid";

/**
 * Browser-compatible logger for application-wide logging.
 *
 * Provides structured logging with event tracking and metadata support.
 * Uses console methods in browser, Winston on server.
 *
 * @module logger
 */

// Type definitions for logger interface
interface LoggerInstance {
  log: (level: string, message: string, meta?: Record<string, unknown>) => void;
}

// Browser-compatible logger implementation
const createBrowserLogger = (): LoggerInstance => {
  return {
    log: (level: string, message: string, meta?: Record<string, unknown>) => {
      const timestamp = new Date().toISOString();
      const metaString = meta && Object.keys(meta).length ? JSON.stringify(meta) : "";
      const logMessage = `[${timestamp}] [${level.toUpperCase()}]: ${message} ${metaString}`;
      
      // Use appropriate console method based on level
      if (level === 'error') {
        console.error(logMessage);
      } else if (level === 'warn') {
        console.warn(logMessage);
      } else {
        console.log(logMessage);
      }
    }
  };
};

// Server-side Winston logger (only imported on server)
let loggerInstance: LoggerInstance;

if (typeof window === 'undefined') {
  // Server-side: use Winston
  try {
    // Dynamic import to avoid bundling Winston in client code
    const winston = require('winston');
    
    if (typeof globalThis.setImmediate === "undefined") {
      (globalThis as Record<string, unknown>).setImmediate = (fn: (...args: unknown[]) => void, ...args: unknown[]) => setTimeout(fn, 0, ...args);
    }

    const logger = winston.createLogger({
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }: { timestamp: string; level: string; message: string; [key: string]: unknown }) => {
          const metaString = Object.keys(meta).length ? JSON.stringify(meta) : "";
          return `[${timestamp}] [${level.toUpperCase()}]: ${message} ${metaString}`;
        }),
      ),
      transports: [new winston.transports.Console()],
    });
    
    loggerInstance = logger as unknown as LoggerInstance;
  } catch (error) {
    // Fallback if Winston fails to load
    loggerInstance = createBrowserLogger();
  }
} else {
  // Client-side: use browser-compatible logger
  loggerInstance = createBrowserLogger();
}

/**
 * Generates a unique request ID for tracing logs across services.
 * @returns {string} A UUID string.
 */
export function generateRequestId() {
  return uuidv4();
}

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
 * Convenience methods for direct logging (backward compatibility with API routes)
 */
export const logger = {
  info: (message: string, meta?: Record<string, unknown> | unknown) => {
    const sanitizedMeta = typeof meta === 'object' && meta !== null ? meta as Record<string, unknown> : { data: meta };
    loggerInstance.log('info', message, sanitizedMeta);
  },
  warn: (message: string, meta?: Record<string, unknown> | unknown) => {
    const sanitizedMeta = typeof meta === 'object' && meta !== null ? meta as Record<string, unknown> : { data: meta };
    loggerInstance.log('warn', message, sanitizedMeta);
  },
  error: (message: string, meta?: Record<string, unknown> | unknown) => {
    const sanitizedMeta = typeof meta === 'object' && meta !== null ? meta as Record<string, unknown> : { data: meta };
    loggerInstance.log('error', message, sanitizedMeta);
  },
  log: (level: string, message: string, meta?: Record<string, unknown>) => loggerInstance.log(level, message, meta),
};

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

export default logger;
