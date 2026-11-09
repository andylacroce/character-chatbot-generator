---
paths:
  - "src/data/game*"
  - "src/data/characterNames.ts"
  - "src/pages/api/*/give-up.ts"
  - "src/app/components/game/GameInstructionsModal.tsx"
  - "packages/shared/src/validation.ts"
  - "src/utils/game/route.ts"
---

- **Giving up via chat reuses the menu's confirmation dialog.** On `"giveUp"`, `message.ts` returns
  `{ giveUpRequested: true }` with no reply; the controller sets a flag and `GamePage.tsx` opens
  the same modal the hamburger's "Give Up" opens. Only on confirm does the client call `give-up.ts`.
  **Give-up is a pure token decode** (no Claude call): `{ revealedName, finalStreak, gameOver: true }`.
- **`GameInstructionsModal.tsx`** shows on first visit (gated by each game's
  `instructions-seen` key) and from the menu. Its copy is accuracy-critical: guesses are typed into
  the same chat box; there is no separate guess control.
- **Curated names.** The game draws from `src/data/gameCharacterNames.ts` (~400 well-known names),
  not the full `characterNames.ts` (~1000, deliberately broad because `/random-character` shows the
  name up front). A hidden obscure figure makes a round unwinnable. Every entry is copied verbatim
  from `characterNames.ts` (`tests/src/data/gameCharacterNames.test.ts` pins this).
  `pickRandomCharacterName.ts` takes an optional `pool` (default: the full list).
- **`src/data/gameCharacterWork.ts`** gives every game name an authored source-work/tradition
  fact (`Record<string, string>` keyed by exact name). `round.ts` threads it into
  `generateGameCluePersonaPrompt` ("you are specifically drawn from: …") and `classifyGuess`'s
  "Hidden character" line, anchoring clues and judgments in the real individual instead of Claude's
  default association for a bare string. `tests/src/data/gameCharacterWork.test.ts` enforces
  completeness both ways. This was the structural fix after disambiguation bugs kept recurring
  (Scarecrow, Tin Man, Cowardly Lion, Hero, Beauty, David Copperfield, The Emperor, The Knight, The
  Monster).
- **Curated-list caveat: `characterNames.ts` is trusted blindly** (neither the game nor Random calls
  `validate-character`, and `round.ts` hardcodes `recognized: true`), and the allowlist also
  short-circuits validation for its names. A bare or ambiguous entry therefore becomes a public,
  cached "recognized" character. Treat any new bare title/role/quality word (with or without a
  leading article) as suspect: disambiguate with a parenthetical work, matching `"Cleopatra (Greek
  mythology)"`. `tests/src/data/characterNames.test.ts` denylists known bare archetypes (leading
  `the`/`a`/`an` stripped) as a secondary backstop.
- **A disambiguation qualifier is identity, not display.** `"David Copperfield (Charles Dickens
  novel)"` keeps its qualifier everywhere it acts as data: the token, every prompt, the
  `avatar_cache` key, `bots.name`, and launch names. Only rendering strips it, via
  `displayCharacterName()` (`packages/shared/src/validation.ts`), which both apps call wherever a
  name is shown (headers, message labels, Wall/carousel captions, Past chats, reveal copy,
  `transcript.ts`). Any new UI surface showing a character name should call it.
- **Rate limits (per IP/min):** `game-start` 10, `game-continue` 10 (both sized for in-process
  persona+avatar cost, the only ceiling on it), `game-message` 10, `game-give-up` 10,
  `game-high-score` 20.
- **Won't do: streaming ordinary per-turn game replies.** `chat.ts` has a `stream: true` mode but no
  client renders a live typing effect anywhere; if wanted, start with ordinary chat's UI.
- Not mechanically verifiable: whether a real guess is judged fairly and whether clue difficulty
  holds up are ongoing manual-QA and prompt-iteration concerns.
