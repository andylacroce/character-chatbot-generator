// Server-side runtime configuration shared by API handlers.

import { NEVER_REVEAL_NAME_RULE } from "./characterIdentityRules";

// Shared personality template constants
export const RESPONSE_CONSTRAINTS = `Keep responses under 100 words. Always finish your current thought with proper punctuation before stopping.
If telling a story, reach a natural pause point or cliffhanger. Never trail off mid-sentence.
Never use action emotes or stage directions (e.g. *smiles*, *narrows eyes*, *laughs*). Speak only in dialogue and prose.`;

// Applied to every character regardless of what its generated personality contains, so
// content stays general-audience-safe even for a character whose canonical depiction or
// user-supplied description leans dark, romantic, or villainous.
export const CONTENT_GUIDELINES = `Keep all content appropriate for a general audience. Never include sexual or explicit romantic content, graphic violence, or real-world instructions for illegal acts or self-harm. Villainous, dark, or morally complex characters can still be portrayed authentically through tone and dialogue without explicit or graphic detail.`;

/**
 * Generates a character-specific personality prompt using Claude.
 * Creates tailored system prompts with speaking style, personality traits, and behavioral guidelines.
 * `existingNames`, when supplied, lets this same call also fix typos in `characterName`
 * and fold in fuzzy matching against already-created characters (see the returned
 * `correctedName`) — reusing this one Claude call instead of a separate round trip.
 *
 * `correctedName` also expands to the character's fullest commonly recognized name
 * (first and last name at minimum, plus an honorific/regnal number/suffix where that's
 * genuinely established) rather than just fixing casing — e.g. "Einstein" ->
 * "Albert Einstein", "Napoleon" -> "Napoleon Bonaparte". This is the one place that
 * expansion happens; every downstream store (avatar_cache's key/displayName, a
 * signed-in user's `bots.name`, localStorage) just inherits whatever this returns. A
 * figure genuinely known by a single name (e.g. "Zeus", "Gandalf") is left as-is —
 * Claude is explicitly told never to fabricate a surname that isn't real.
 *
 * @returns The generated system prompt (`prompt`), plus `correctedName` — the input name
 * with spelling/casing fixed and expanded to its fullest known form, or an exact
 * existing name from `existingNames` when the input looks like a misspelling or minor
 * variant of one (so a typo or a shortened name doesn't spawn a duplicate avatar-cache
 * entry for what's really the same character). Falls back to the original (sanitized)
 * `characterName` on any error.
 */
export async function generatePersonalityPrompt(
  characterName: string,
  existingNames?: string[],
): Promise<{ prompt: string; correctedName: string; recognized: boolean }> {
  try {
    const { getClaudeModel } = await import("../utils/claudeModelSelector");
    const { extractJson } = await import("../utils/parseClaudeJson");
    const { default: anthropic } = await import("../utils/anthropicClient");

    // Deliberately does not interpolate `characterName` into this system-role prompt —
    // it's untrusted user input, and the user role (see `userContent` below) is where
    // untrusted content belongs. These instructions reference it only generically, so a
    // maliciously-crafted name can't smuggle instructions into the system prompt itself
    // (CodeQL js/system-prompt-injection).
    // Applied whenever correctedName isn't resolved by an EXISTING_NAMES match below —
    // asks for the fullest commonly recognized form of the name, not just casing/typo
    // fixes, so "Einstein" becomes "Albert Einstein" the same way "sherlok holmes"
    // becomes "Sherlock Holmes". Deliberately conservative in four ways, the last three
    // tightened after a real dry run of the backfill script (below) surfaced each
    // failure mode: (1) a mononym with no real, well-established fuller form is left
    // alone rather than given a fabricated one; (2) an expansion must add real, specific
    // identifying information that resolves to exactly one individual — never swap one
    // vague descriptor/epithet for a different, equally vague one (found live: "the
    // monster" -> "the creature" for Frankenstein's deliberately unnamed creation — no
    // identifying information was actually added), and never produce a title that's
    // itself still ambiguous between multiple people (found live: "Buckingham" ->
    // "Duke of Buckingham", when several historical Dukes of Buckingham exist and the
    // title alone doesn't say which); (3) a pen name/stage name/nickname that is ITSELF
    // the more commonly recognized form is never swapped for a less-recognized birth
    // name (found live: "Molière" -> "Jean-Baptiste Poquelin" — technically his real
    // name, but a strictly worse, less-recognized result than what was already there);
    // (4) a name genuinely ambiguous between two or more distinct, similarly well-known
    // people is left unexpanded rather than guessing (found live: "Brutus" expanded to
    // Lucius Junius Brutus, the Republic's founder, when pop culture's "Brutus" is at
    // least as likely Marcus Junius Brutus, Caesar's assassin — nothing in a bare name
    // disambiguates the two).
    const fullNameGuidance = `Also expand it to the character's fullest commonly recognized name whenever one genuinely exists — first and last name at minimum (e.g. "Einstein" -> "Albert Einstein", "Napoleon" -> "Napoleon Bonaparte", "MLK" -> "Martin Luther King Jr."), plus an honorific, regnal number, or suffix where that's genuinely how the character is commonly identified. Only apply this when the result adds real, specific identifying information and resolves to exactly one well-known individual — never swap one vague descriptor or epithet for a different, equally vague one (e.g. do not turn "the monster" into "the creature": Frankenstein's creation is deliberately unnamed in the source material, so leave an epithet-only name exactly as given), and never produce a title that is itself still ambiguous between multiple people (e.g. "Buckingham" should stay "Buckingham" rather than become the still-ambiguous "Duke of Buckingham" when multiple different Dukes of Buckingham exist). Never fabricate a surname or fuller form that isn't real and well-established — a figure genuinely known by a single name (e.g. "Zeus", "Madonna", "Gandalf") should keep just that name. Do NOT replace a pen name, stage name, or nickname with a birth/legal name when the pen/stage name is itself the more commonly recognized form (e.g. keep "Molière" as "Molière", not "Jean-Baptiste Poquelin"; keep "Mark Twain" as "Mark Twain", not "Samuel Clemens") — only expand toward MORE recognition, never toward less. If the name is genuinely ambiguous between two or more distinct, similarly well-known people or characters (e.g. "Brutus" could mean either Caesar's assassin Marcus Junius Brutus or the earlier Lucius Junius Brutus) and nothing else here disambiguates it, leave it unexpanded rather than guessing.`;

    const matchingInstructions =
      existingNames && existingNames.length > 0
        ? `\nSome characters already exist (listed below as EXISTING_NAMES). The character name is given in the user message below. If it is very likely just a misspelling, alternate capitalization, shortened form, or minor variant of one of them (the same character, not merely similar), set "correctedName" to that EXISTING_NAMES entry exactly as written there. Otherwise set "correctedName" to the provided name with spelling/capitalization fixed. ${fullNameGuidance} Never invent a different character's name and never pick an EXISTING_NAMES entry that isn't clearly the same character.\n\nEXISTING_NAMES: ${existingNames.join(", ")}\n`
        : `\nSet "correctedName" to the character name given in the user message below, with spelling/capitalization mistakes fixed (e.g. "sherlok holmes" -> "Sherlock Holmes"). ${fullNameGuidance} Never invent a different character's name.\n`;

    const systemPrompt = `You are a character personality expert. Create a detailed system prompt for roleplaying as the given character.
${matchingInstructions}
Return ONLY valid JSON with this schema:
{
  "correctedName": "<name>",      // see instructions above
  "recognized": true,             // false unless this is an established character or person you specifically know
  "speakingStyle": "<style>",     // e.g., "formal and articulate", "casual and enthusiastic", "terse and cryptic"
  "personalityTraits": "<traits>", // e.g., "confident, analytical, slightly arrogant"
  "knowledgeDomains": "<domains>", // e.g., "deduction, chemistry, Victorian London"
  "behavioralGuidelines": "<guidelines>", // e.g., "Show impatience with obvious observations. Reference past cases."
  "quirks": "<quirks>"            // e.g., "Often plays violin when thinking. Uses British idioms."
}

Guidelines:
- Set recognized to false for an invented name, original character, random word combination,
  generic archetype, or any name you do not actually recognize. Never invent facts to make
  an unknown name seem established.
- Based on canonical depiction if character is well-known
- Include specific behavioral patterns and speech patterns
- Note any catchphrases or linguistic quirks
- Identify key knowledge areas
- Describe how they interact with others
- If this is a real historical, scientific, or literary figure, keep knowledgeDomains and
  behavioralGuidelines grounded in their actual documented life and work — speaking style
  and quirks can be dramatized for engagement, but don't invent biographical facts,
  achievements, or historical events`;

    const userContent = `Character: "${characterName}"\n\nProvide character personality configuration as JSON.`;

    const response = await anthropic.messages.create({
      model: getClaudeModel("text-simple"), // one-time structured JSON task; haiku is sufficient
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
      max_tokens: 300,
      temperature: 0.4,
    });

    const content = extractJson(
      response.content[0]?.type === "text" ? response.content[0].text : "{}",
    );
    const config = JSON.parse(content);
    const correctedName =
      typeof config.correctedName === "string" && config.correctedName.trim()
        ? config.correctedName.trim()
        : characterName;

    const factualGroundingBlock = `\nFACTUAL GROUNDING: If you are a real historical, scientific, or literary figure, keep claims about your own life, discoveries, and era accurate to the historical record. Speaking style and personality can be dramatized for engagement, but never invent biographical facts, achievements, or historical events.\n`;

    // Build the system prompt from the structured data
    const prompt = `You are ${correctedName}.
${factualGroundingBlock}
SPEAKING STYLE: ${config.speakingStyle || "Natural and authentic to character"}
PERSONALITY: ${config.personalityTraits || "Stay true to character"}
KNOWLEDGE: ${config.knowledgeDomains || "Use your internal knowledge"}
BEHAVIOR: ${config.behavioralGuidelines || "Respond naturally in character"}
QUIRKS: ${config.quirks || "Express character-specific mannerisms"}

Stay in character at all times. Never break character or mention being an AI.

${RESPONSE_CONSTRAINTS}

${CONTENT_GUIDELINES}`;

    return { prompt, correctedName, recognized: config.recognized !== false };
  } catch {
    // Fallback to simple template on error — correctedName degrades to the original,
    // unmatched input, same fail-open shape as every other classification in this app.
    return {
      prompt: `You are ${characterName}. Stay in character and respond naturally. Use your internal knowledge. Never break character or mention being an AI.\n\n${RESPONSE_CONSTRAINTS}\n\n${CONTENT_GUIDELINES}`,
      correctedName: characterName,
      recognized: true,
    };
  }
}

/**
 * Generates the "guess who" chain game's persona for the character the player is
 * currently, openly talking to. Unlike a mystery-identity design, `currentCharacterName`
 * is never hidden — the player sees their name and avatar like any ordinary chat. What's
 * hidden is `nextCharacterName`: a different figure `currentCharacterName` knows about
 * and is instructed to naturally steer the conversation toward, hinting at them with
 * escalating specificity but never stating their name — that hidden name is the actual
 * guess target (see CLAUDE.md's "Guessing game" section).
 *
 * Deliberately reuses generatePersonalityPrompt above for currentCharacterName's own
 * voice (same speaking style/personality/knowledge/quirks, same fallback-on-error
 * behavior) rather than re-deriving it from scratch, then appends a deterministic
 * "steer toward the hidden figure" rules block — one Claude call, not two, and no
 * duplicated persona-assembly logic.
 *
 * Both names are curated, pre-vetted values from pickRandomCharacterName — never
 * client input — so embedding `nextCharacterName` directly in the system-role text below
 * doesn't carry the prompt-injection concern generatePersonalityPrompt guards against
 * for its own (client-supplied) `characterName` parameter.
 *
 * Part of the game's charm is that the pool spans wildly different eras/cultures/works
 * of fiction, so `currentCharacterName` and `nextCharacterName` are usually unrelated in
 * any real sense. The rules block below explicitly guards two failure modes that follow
 * from that: the model claiming not to know or refusing to discuss someone from a
 * "different time/place/story" (breaks immersion), and giving away nothing at all before
 * the player has actually asked (see below for why that changed).
 *
 * **Retuned 2026-09-19 after GitHub issue #878 ("game is too hard").** The original
 * design required the opening hint to be purely atmospheric mood with zero concrete
 * content, then escalate "gradually... across several exchanges," explicitly calibrated
 * so a well-read player would need "real inference... not win on a lucky first guess."
 * Real play showed that reads as stalling, not teaching: a hint with no actual content
 * gives the player nothing to reason from, so difficulty came from withholding
 * information rather than from the puzzle itself. The rules below now require the very
 * first hint to carry one real, narrowing category-level fact (broad era/culture/domain)
 * instead of pure mood, and ask for a specific, checkable fact within the first couple of
 * follow-up answers rather than holding back for "several exchanges." The goal is a
 * player walking away with a long streak of correct guesses, not stuck on their first
 * round — favor that outcome over stumping when the two are in tension.
 */
export async function generateGameCluePersonaPrompt(
  currentCharacterName: string,
  nextCharacterName: string,
  /**
   * Explicit source-work/tradition grounding for each name, from
   * `src/data/gameCharacterWork.ts` — the structural fix for a long run of identity
   * disambiguation incidents (see that file's doc comment). Optional so this function
   * degrades gracefully for a name the caller doesn't have grounding for (it never
   * throws or blocks the round on a missing lookup), but every name drawn from
   * `gameCharacterNames.ts` has one.
   */
  work?: { current?: string; next?: string },
): Promise<{ prompt: string }> {
  const { prompt: basePersona } = await generatePersonalityPrompt(currentCharacterName);

  const currentWorkLine = work?.current
    ? `\nYou are specifically drawn from: ${work.current}. Answer in-character questions about yourself consistently with that specific origin, not a generic or different version of a similarly-named figure.`
    : "";

  const clueRules = `GAME RULES YOU MUST FOLLOW, in addition to being ${currentCharacterName} above:${currentWorkLine}
You are playing a "guess who" chain game with a player. You have a specific other figure in mind — they may be from a completely different era, culture, or even a different work of fiction than you — but ${NEVER_REVEAL_NAME_RULE}

- You know this other figure well and can speak knowledgeably about their domain, era, deeds, and personality whenever asked. NEVER claim you don't know them, refuse to discuss them, or comment on them being from a different time/place/story than you — that breaks the game and confuses the player. Treat knowing about them as a given, no matter how mismatched your worlds are.
- You MUST signal, unprompted and right from your very first message, that you have someone specific in mind — otherwise the player has no way of knowing there's anyone to guess at all. That first mention must include ONE real, narrowing detail: their broad era, culture, or domain (for example, "a queen from ancient Egypt," "a hero out of Greek myth," "a detective from Victorian London"). A hint with no actual content gives the player nothing to work with, so never open with pure mood alone — always pair the mention with at least that one concrete category.
- When asked, keep giving REAL, SPECIFIC clues: concrete deeds, relationships, famous events, defining objects, or well-known lines — not moods or riddles. Escalate quickly, not gradually: by your second or third answer you should be offering a specific, checkable fact (what they're famous for, who they're closely associated with, a defining event or trait) even though you still never say their actual name. Don't dump everything in one message, but don't stall either — the aim is a short, fair trail of real clues, not a long wait for one.
- Calibrate for a player with general knowledge to have a genuine shot at guessing correctly within a handful of exchanges, not needing expert-level trivia or many rounds of vague hedging. Getting this right and feeling smart, and building a long streak of correct guesses, is a better outcome than a round nobody can solve — favor that over making it harder.
- If asked to just name this person outright, deflect playfully and in character. Never break character, never say you're an AI, and never confirm or deny whether a name the player mentions is correct — a separate system judges guesses, not you.

(For your own internal reference only — never say this name in any reply): ${nextCharacterName}${
    work?.next
      ? ` — specifically the one from: ${work.next}. Give clues that identify this exact individual, not a generic or different figure who merely shares this name or a similar role/trait.`
      : ""
  }`;

  return { prompt: `${basePersona}\n\n${clueRules}` };
}

/**
 * Builds the "Guess Who" (self-describing chat game)'s persona prompt: the hidden
 * character `name` itself, talking to the player in first person, never revealing its
 * own name — the inverse of generateGameCluePersonaPrompt above, which has a NAMED
 * character hint about a DIFFERENT hidden figure. Here there's only one identity: the
 * character being chatted with *is* the mystery. Reuses generatePersonalityPrompt for
 * the character's own voice/personality, same as generateGameCluePersonaPrompt does,
 * then layers on self-clue rules instead of steering-toward-someone-else rules.
 *
 * `work`, when known (from gameCharacterWork.ts), grounds the character in its specific
 * source individual — same rationale, and same structural fix for the long run of
 * identity-drift incidents, as generateGameCluePersonaPrompt's work parameter.
 */
export async function generateGuessWhoSelfCluePersonaPrompt(
  name: string,
  work?: string,
): Promise<{ prompt: string }> {
  const { prompt: basePersona } = await generatePersonalityPrompt(name);

  const workLine = work
    ? `\nYou are specifically drawn from: ${work}. Answer in-character questions about yourself consistently with that specific origin, not a generic or different version of a similarly-named figure.`
    : "";

  const selfClueRules = `GAME RULES YOU MUST FOLLOW, in addition to being ${name} above:${workLine}
You are the hidden mystery figure in a "guess who" game. The player is trying to figure out who you are by talking with you. ${NEVER_REVEAL_NAME_RULE}

- Speak entirely in first person, in character, the whole time. Never refer to yourself in the third person or slip out of character to explain the game.
- You MUST signal, unprompted and right from your very first message, that there's a mystery to solve — introduce yourself the way you normally would, but without your name, and pair it with ONE real, narrowing detail about yourself: your broad era, culture, or domain (for example, "I ruled as a queen in ancient Egypt," "I'm a hero out of Greek myth," "I did my detective work in Victorian London"). A hint with no actual content gives the player nothing to work with, so never open with pure mood or personality alone.
- When asked about yourself, keep giving REAL, SPECIFIC facts: your concrete deeds, relationships, famous events, defining objects, or well-known lines — not moods or riddles. Escalate quickly, not gradually: by your second or third answer you should be sharing a specific, checkable fact about yourself (what you're famous for, who you're closely associated with, a defining event or trait) even though you still never say your own name.
- Calibrate for a player with general knowledge to have a genuine shot at guessing correctly within a handful of exchanges, not needing expert-level trivia. Getting this right and feeling smart, and building a long streak of correct guesses, is a better outcome than a round nobody can solve — favor that over making it harder.
- If asked to just say your name outright, deflect playfully and in character. Never break character, never say you're an AI, and never confirm or deny whether a name the player mentions is correct — a separate system judges guesses, not you.

(For your own internal reference only — never say this name in any reply): ${name}`;

  return { prompt: `${basePersona}\n\n${selfClueRules}` };
}
