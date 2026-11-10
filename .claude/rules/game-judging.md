---
paths:
  - "src/utils/game/classifyGuess.ts"
  - "src/utils/game/gameReply.ts"
  - "src/config/serverConfig.ts"
  - "src/utils/game/round.ts"
  - "src/app/api/*/message/route.ts"
---

- **The classifier's bars** (`classifyGuess`): one specific candidate name is `"clear"`, even
  phrased as a question or hedged ("is it X?", "maybe X or something?"), because bouncing it back
  made the game feel unresponsive. Two or more names with no stated pick is `"ambiguous"`, but an
  explicit commitment ("I'm going with X") wins over floated extras, and once the character has
  asked for a single name the classifier takes the most committed (else last) one rather than
  asking again. `AMBIGUOUS_GUESS_NOTE` never lets the character say or imply whether a name is
  right and never mentions judges or a system (an earlier version leaked the verdict, so a round
  was answered yet never scored, and "a separate system judges guesses" in the persona prompt made
  characters talk about "the judges"). An earlier version bounced "Edward" vs "Edmund Ironside"
  for eight turns, found only via real session logs decoded from `/api/audio?...&text=`. `"correct"` demands the *same individual*: leniency
  covers only surface forms (short/full names, nicknames, genuine aliases, spelling/localization,
  title-names of the same person), never related people (Hamlet vs Laertes), a shared trait or
  epithet (Beauty vs Cleopatra), or cross-tradition counterparts (Venus vs Aphrodite, Ares/Mars,
  Zeus/Jupiter). Default `correct: false` when unsure. If it regresses, expect a *wrong* guess
  scored as a win; check for that before loosening the prompt.
- **A miss on the round's first message is free, once.** `message.ts` spends the token's signed
  `freeMissUsed` flag instead of `wrongGuessCount`, so exploratory opening guesses don't end a run
  after one clue. The flag, not the client's history length, bounds it (an empty history can't
  farm free misses). Client copy ("one wrong guess is OK") is still accurate; the warm-up is a bonus.
- **Hidden-name guard.** `getGameReply`/`getOpeningReply` take the hidden name; a reply that says
  it unprompted (the player's own message didn't) is regenerated once, then replaced with a neutral
  line. A real Guess Who opening once began "Bagheera... ah, but you must discover that".
- **Persona is grounded by a qualified name.** `generateGuessWhoSelfCluePersonaPrompt` and
  `generateGameCluePersonaPrompt` generate the base persona from `Name (work)`, since appending the
  work fact afterward lost to the bare name (a bare "Pluto" played Disney's dog while the answer was
  the Roman god). The name is now `Pluto (Roman mythology)` in the name and work lists. Base
  personas are memoized per warm instance (`gameBasePersona`, 500 entries, never the error
  fallback, which `generatePersonalityPrompt` flags with `fallback: true`).
- **Cost levers (keep them).** `classifyGuess` skips its Haiku call for a long message with no cue word and no capitalized name (short ones
  like "zeus" always classify). Verdict reactions use Haiku, and game replies cap at 220 tokens.
  **Prompt caching was tried and removed:** a game persona prefix is ~900 tokens, under the
  model's cache minimum (a live check showed 0 cache reads and writes), and chat's is no longer.
  Revisit only if a prompt grows past roughly 2k tokens, and verify with `usage.cache_read_input_tokens`.
