/**
 * Security utilities for input sanitization and validation
 * @module security
 */

/**
 * Escapes HTML characters to prevent XSS attacks
 * @param {string} str - The string to escape
 * @returns {string} The escaped string
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, function (tag) {
    const chars: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return chars[tag] || tag;
  });
}

/**
 * Sanitizes a string for safe display by escaping HTML
 * @param {string} str - The string to sanitize
 * @returns {string} The sanitized string
 */
export function sanitizeForDisplay(str: string): string {
  return escapeHtml(str);
}

/**
 * Validates and sanitizes a character name for use in prompts
 * @param {string} name - The character name to validate
 * @returns {string} The sanitized name or empty string if invalid
 */
export function sanitizeCharacterName(name: string): string {
  if (typeof name !== 'string') return '';
  // Remove potentially dangerous characters and limit length
  const sanitized = name.replace(/[<>'"&]/g, '').trim();
  return sanitized.length > 100 ? sanitized.substring(0, 100) : sanitized;
}