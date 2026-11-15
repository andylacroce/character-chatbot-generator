/**
 * The name check `/api/generate-personality` runs before spending a Claude call or signing a
 * persona. Same inputs as generate-avatar's gate (allowlist, blocklist, classifier) with one
 * difference in purpose: a copyright-listed name is NOT refused here, because the client's
 * "Continue Anyway" path still creates a private character through this route.
 */

import { isAllowlisted } from "./characterAllowlist";
import { getBlocklistEntry } from "./characterBlocklist";
import { classifyCharacterName } from "./characterClassifier";
import { logEvent, sanitizeLogMeta } from "../logger";
import { getCachedAvatar } from "../avatar/avatarCache";

/** Why a name was refused: a hard block, or the classifier could not be consulted. */
export type PersonaGateResult = "ok" | "blocked" | "unavailable";

/** Checks a sanitized name; a cached name was already vetted, and a classifier error fails closed. */
export async function checkPersonaName(name: string): Promise<PersonaGateResult> {
  if (await isAllowlisted(name)) return "ok";
  const listed = await getBlocklistEntry(name);
  if (listed) return listed.category === "content" ? "blocked" : "ok";
  if (await getCachedAvatar(name)) return "ok";
  try {
    return (await classifyCharacterName(name)).blocked ? "blocked" : "ok";
  } catch (err) {
    logEvent(
      "error",
      "personality_gate_check_failed",
      "Name classification failed; refusing",
      sanitizeLogMeta({ error: err instanceof Error ? err.message : String(err) }),
    );
    return "unavailable";
  }
}
