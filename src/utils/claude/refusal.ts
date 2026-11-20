/** Thrown when Claude's safety classifiers decline a request (`stop_reason: "refusal"`). */
export class ClaudeRefusalError extends Error {
  /** The policy category (`cyber`, `bio`, ...), or null when the refusal has none. */
  readonly category: string | null;

  /** Builds the error from the response's `stop_details`. */
  constructor(details?: { category?: string | null } | null) {
    super("Claude declined to answer");
    this.name = "ClaudeRefusalError";
    this.category = details?.category ?? null;
  }
}

/** Throws `ClaudeRefusalError` when a response stopped because Claude declined; call it before reading `content`, which a refusal leaves empty or partial. */
export function throwIfRefused(response: {
  stop_reason?: string | null;
  stop_details?: { category?: string | null } | null;
}): void {
  if (response.stop_reason === "refusal") throw new ClaudeRefusalError(response.stop_details);
}
