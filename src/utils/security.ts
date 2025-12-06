/**
 * Security utilities for input sanitization and validation
 * @module security
 */

/**
 * Decodes HTML entities in a string
 * @param {string} str - The string to decode
 * @returns {string} The decoded string
 */
export function decodeHtmlEntities(str: string): string {
  if (typeof str !== 'string') return '';
  // Decode named HTML entities (e.g., &lt; to <)
  const entityMap: { [key: string]: string } = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&#x27;': "'",
    '&#x2F;': '/',
    '&#x60;': '`',
    '&#x3D;': '=',
  };
  
  return str.replace(/&[a-zA-Z0-9#]+;/g, (entity) => {
    if (entityMap[entity]) return entityMap[entity];
    
    // Parse numeric character references (decimal or hexadecimal)
    if (entity.startsWith('&#x')) {
      // Hexadecimal numeric reference (&#x...;)
      const code = parseInt(entity.slice(3, -1), 16);
      if (code >= 0 && code <= 0x10FFFF && (code < 0xD800 || code > 0xDFFF)) {
        return String.fromCodePoint(code);
      }
    } else if (entity.startsWith('&#')) {
      // Decimal numeric reference (&#...;)
      const code = parseInt(entity.slice(2, -1), 10);
      if (code >= 0 && code <= 0x10FFFF && (code < 0xD800 || code > 0xDFFF)) {
        return String.fromCodePoint(code);
      }
    }
    
    return entity; // Unknown entity; return as-is without decoding
  });
}

/**
 * Escapes HTML characters to prevent XSS attacks
 * @param {string} str - The string to escape
 * @returns {string} The escaped string
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"`]/g, function (tag) {
    const chars: { [key: string]: string } = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "`": "&#x60;",
    };
    return chars[tag] || tag;
  });
}

/**
 * Unescapes JavaScript string escape sequences
 * @param {string} str - The string to unescape
 * @returns {string} The unescaped string
 */
export function unescapeString(str: string): string {
  if (typeof str !== 'string') return '';
  return str.replace(/\\(.)/g, (match, char) => {
    switch (char) {
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'v': return '\v';
      case '0': return '\0';
      case '\\': return '\\';
      case '"': return '"';
      case "'": return "'";
      default: return match;
    }
  });
}

/**
 * Sanitizes a string for safe display by unescaping, decoding HTML entities, and escaping HTML
 * Use this for HTML generation (like transcripts) where you need HTML escaping.
 * @param {string} str - The string to sanitize
 * @returns {string} The sanitized string
 */
export function sanitizeForDisplay(str: string): string {
  if (typeof str !== 'string') return '';
  
  // First unescape JavaScript escape sequences
  str = unescapeString(str);
  
  // Step 2: Decode HTML entities (e.g., &lt; to <)
  str = decodeHtmlEntities(str);
  
  // Step 3: Escape dangerous HTML characters for display safety
  return escapeHtml(str);
}

/**
 * Sanitizes a string for display in React components.
 * Unescapes JavaScript sequences and decodes HTML entities, but does NOT escape HTML
 * since React automatically handles XSS protection.
 * @param {string} str - The string to sanitize
 * @returns {string} The sanitized string ready for React display
 */
export function sanitizeForReact(str: string): string {
  if (typeof str !== 'string') return '';
  
  // Step 1: Unescape JavaScript escape sequences
  str = unescapeString(str);
  str = decodeHtmlEntities(str);
  
  // Step 3: Do NOT escape - React's JSX automatically prevents XSS attacks
  return str;
}

/**
 * Validates and sanitizes a character name for use in prompts
 * @param {string} name - The character name to validate
 * @returns {string} The sanitized name or empty string if invalid
 */
export function sanitizeCharacterName(name: string): string {
  if (typeof name !== 'string') return '';
  // Remove dangerous characters, trim whitespace, and limit length for safety
  const sanitized = name.replace(/[<>'"&]/g, '').trim();
  return sanitized.length > 100 ? sanitized.substring(0, 100) : sanitized;
}