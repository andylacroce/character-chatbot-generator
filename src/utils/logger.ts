import { v4 as uuidv4 } from "uuid";

/**
 * Browser-compatible logger for application-wide logging.
 *
 * Provides structured logging with event tracking and metadata support.
 * Uses console methods in browser, Winston on server.
 *
 * @module logger
 */

/** Logger interface definition */
interface LoggerInstance {
  log: (level: string, message: string, meta?: Record<string, unknown>) => void;
}

/** Browser-compatible logger implementation for client-side logging */
const createBrowserLogger = (): LoggerInstance => {
  return {
    log: (level: string, message: string, meta?: Record<string, unknown>) => {
      const timestamp = new Date().toISOString();
      const metaString = meta && Object.keys(meta).length ? JSON.stringify(meta) : "";
      const logMessage = `[${timestamp}] [${level.toUpperCase()}]: ${message} ${metaString}`;
      
      // Select appropriate console method based on log level
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

/** Winston-based server-side logger (only imported on server) */
let loggerInstance: LoggerInstance;

// For testability: allow forcing server logger via env var in tests
const FORCE_SERVER_LOGGER = typeof process !== 'undefined' && (process.env as Record<string,string> | undefined)?.FORCE_SERVER_LOGGER === '1';
if (typeof window === 'undefined' || FORCE_SERVER_LOGGER) {
  // Use Winston logger on server side
  try {
    // Dynamically require Winston via eval to avoid bundling it into client code
    // This hides the static 'require("winston")' call from bundlers like Turbopack.
    type WinstonLike = {
      createLogger: (opts: { level?: string; format?: unknown; transports?: unknown[] }) => unknown;
      transports?: { Console: new (...args: unknown[]) => unknown } | undefined;
      format?: {
        combine: (...args: unknown[]) => unknown;
        timestamp: () => unknown;
        printf: (fn: (...args: unknown[]) => string) => unknown;
      } | undefined;
    };
    // Test hook: if a test provides a global winston mock, prefer that (useful when 'require' isn't present)
    const testWinston = (globalThis as unknown as Record<string, unknown>)?.__TEST_WINSTON__ as WinstonLike | undefined;
    const winston = testWinston ?? (Function('return require')() as unknown as (id: string) => unknown)('winston') as WinstonLike;

    if (typeof globalThis.setImmediate === "undefined") {
      (globalThis as Record<string, unknown>).setImmediate = (fn: (...args: unknown[]) => void, ...args: unknown[]) => setTimeout(fn, 0, ...args);
    }

    const logger = (winston as WinstonLike).createLogger({
      level: "info",
      format: (winston as WinstonLike).format!.combine(
        (winston as WinstonLike).format!.timestamp(),
        (winston as WinstonLike).format!.printf((info: unknown) => {
          const { timestamp, level, message, ...meta } = info as { timestamp: string; level: string; message: string; [key: string]: unknown };
          const metaString = Object.keys(meta).length ? JSON.stringify(meta) : "";
          return `[${timestamp}] [${level.toUpperCase()}]: ${message} ${metaString}`;
        }),
      ),
      transports: [new ((winston as WinstonLike).transports!.Console)()],
    });

    loggerInstance = logger as unknown as LoggerInstance;
  } catch (e) {
    // Fallback if Winston fails to import or initialize
    // Log the failure on server when possible (avoid throwing during import)
    try {
      console.warn('Winston not available, falling back to browser logger:', (e as Error)?.message || e);
    } catch {}
    loggerInstance = createBrowserLogger();
  }
} else {
  // Use browser-compatible logger on client side
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
      // For objects, extract only shallow keys or create a summary
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
