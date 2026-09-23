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

/**
 * A character name as people should see it: without a trailing disambiguation
 * qualifier. The curated name lists spell ambiguous names with one, e.g. "David
 * Copperfield (Charles Dickens novel)", so Claude, the game token, and the avatar cache
 * key all resolve the right person. Keep the full name as the identity everywhere;
 * strip it only at render time.
 */
export function displayCharacterName(name: string): string {
  // String scanning, not a regex: `\s*\(...\)\s*$` backtracks polynomially on long runs
  // of spaces, and the server runs this on client-supplied names (transcript.ts).
  const trimmed = name.trimEnd();
  if (!trimmed.endsWith(")")) return name;
  const open = trimmed.lastIndexOf("(");
  if (open <= 0 || trimmed.slice(open + 1, -1).includes(")")) return name;
  return trimmed.slice(0, open).trimEnd() || name;
}
