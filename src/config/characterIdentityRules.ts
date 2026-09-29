/**
 * Shared "same individual vs. different individual" guess-matching rules, extracted
 * from the guessing game's `classifyGuess` system prompt (src/pages/api/guess-who-next/message.ts)
 * so a future fix to this hard-won logic applies to every game that judges a free-text
 * guess against a hidden character name, not just the one that first needed it.
 *
 * The wording here is the exact rule text that fixed three real production incidents
 * (see CLAUDE.md's "Guessing game" section): Edward/Edmund (leniency on name *form*),
 * Hamlet/Laertes and Beauty/Cleopatra (leniency on name form must never become leniency
 * on *identity*), and Venus/Aphrodite (cross-tradition mythological counterparts are
 * distinct characters here, even when commonly equated). Do not loosen this wording
 * without re-reading why each example exists — the two failure modes (a real wrong
 * guess scored as a win, or a real right guess bounced to "not a match" forever) look
 * opposite and can each regress independently.
 */

/** The correctness rule text, meant to be embedded inside a `<correctness_rule>` XML block. */
export const IDENTITY_MATCH_RULES = `Leniency applies only to the surface form of the name: accept shortened/full forms, common nicknames, genuine aliases, spelling/transliteration/localization variants, and established epithets or title-names only when they still name the literal same individual. Name leniency is never identity leniency. Do not accept a different person or character because they are analogous, closely associated, commonly confused, or fit the clues. Mythological or religious counterparts from different traditions are distinct characters for this game, even when later cultures equated or syncretized them, or when they govern the same domain (for example, Aphrodite is not Venus, Ares is not Mars, and Zeus is not Jupiter). Require literal identity: the guess must name that exact individual, never someone merely similar. Three failure modes to watch for:
1. A different, related character (family, rival, foil, same story) is not a match.
2. A guess that fits a trait/role/epithet used to hint at the hidden character (e.g. both are "a king", both are "a great beauty") is not a match unless it is that same individual.
3. A counterpart or analogue from another culture, mythology, or religion is not a match, even if the figures are commonly equated.
When genuinely unsure whether the guess is the same individual or a different one who merely fits the same description, decide "correct": false — a real right answer can just be told to try rephrasing, but a wrong answer scored as a win ends the round with no way back.`;

/**
 * Worked few-shot examples backing IDENTITY_MATCH_RULES, formatted as ready-to-embed
 * `<example>` blocks (each already JSON-shaped for a `{"reasoning", "status"/"correct"}`
 * response). Callers with a different output schema (the new clue-reveal game has no
 * "status" field, only "correct") should adapt the JSON shape per example rather than
 * embedding these verbatim — the narrative content (which name pairs count as a match)
 * is what must stay consistent, not the exact JSON keys.
 */
export const IDENTITY_MATCH_EXAMPLES = `<example>
Hidden character: "Edmund Ironside"
Player's message: "Edward"
{"reasoning": "A single confident name offered as an identification, not a question — clear. Edward is not Edmund Ironside.", "correct": false}
</example>
<example>
Hidden character: "Laertes"
Player's message: "Hamlet"
{"reasoning": "Clear identification, but Hamlet is a different character from the same play, not Laertes.", "correct": false}
</example>
<example>
Hidden character: "Beauty (Beauty and the Beast)" — specifically the one from: The fairy tale Beauty and the Beast
Player's message: "Cleopatra"
{"reasoning": "Clear identification, but Cleopatra only shares the 'great beauty' trait the clues used — she is a different individual from Beauty, and not from the stated work.", "correct": false}
</example>
<example>
Hidden character: "William Shakespeare"
Player's message: "The Bard of Avon"
{"reasoning": "A well-known epithet for the exact same individual counts as a match.", "correct": true}
</example>
<example>
Hidden character: "Venus"
Player's message: "Aphrodite"
{"reasoning": "Aphrodite is Venus's Greek counterpart, but they are distinct mythological characters in different traditions for this game.", "correct": false}
</example>`;

/**
 * The "never say the name or an unambiguous unique title" clue-writing rule, extracted
 * from `generateGameCluePersonaPrompt` (src/config/serverConfig.ts) so both the
 * chat-steering game's persona prompt and the clue-reveal game's clue-generation prompt
 * enforce the exact same constraint on the model that writes hints about a hidden
 * character.
 */
export const NEVER_REVEAL_NAME_RULE =
  "You must NEVER say their name or an unambiguous unique title for them (that would give it away as surely as saying it outright).";
