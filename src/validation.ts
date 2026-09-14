/**
 * Input sanitization shared by the web app and mobile client, so both enforce
 * identical rules client-side. The server (character-chatbot-generator's
 * src/utils/security.ts) is the authoritative enforcement point in both cases —
 * these are UX-layer copies, kept in sync by living in one place.
 */

/**
 * Validates and sanitizes a character name for use in prompts.
 */
export function sanitizeCharacterName(name: string): string {
  if (typeof name !== "string") return "";
  const sanitized = name.replace(/[<>'"&]/g, "").trim();
  return sanitized.length > 100 ? sanitized.substring(0, 100) : sanitized;
}

/**
 * Validates and sanitizes a free-form character description supplied by the user
 * (used to generate a personality for a name that isn't recognized as an existing
 * character). Quotes and punctuation are preserved since this is prose, not an
 * identifier — only HTML/script injection vectors are stripped.
 */
export function sanitizeDescription(description: string): string {
  if (typeof description !== "string") return "";
  const sanitized = description.replace(/[<>`]/g, "").trim();
  return sanitized.length > 500 ? sanitized.substring(0, 500) : sanitized;
}

/**
 * Validates and sanitizes the human user's own preferred name (used to personalize
 * a character's greeting). Apostrophes and hyphens are preserved since real names
 * legitimately use them (e.g. "O'Brien", "Mary-Jane").
 */
export function sanitizeUserName(name: string): string {
  if (typeof name !== "string") return "";
  const sanitized = name.replace(/[<>`]/g, "").trim();
  return sanitized.length > 50 ? sanitized.substring(0, 50) : sanitized;
}
