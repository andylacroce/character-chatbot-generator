import winston from "winston";
import { v4 as uuidv4 } from "uuid";

/**
 * Winston logger instance for application-wide logging.
 * @type {import('winston').Logger}
 */
if (typeof globalThis.setImmediate === "undefined") {
  (globalThis as any).setImmediate = (fn: (...args: any[]) => void, ...args: any[]) => setTimeout(fn, 0, ...args);
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
 * @returns {string}
 */
export function generateRequestId() {
  return uuidv4();
}

export default logger;
