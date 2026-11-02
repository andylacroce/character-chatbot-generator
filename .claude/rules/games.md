---
paths:
  - "src/utils/game/**"
  - "src/utils/gameReply.ts"
  - "src/utils/classifyGuess.ts"
  - "src/pages/api/*/start.ts"
  - "src/pages/api/*/continue.ts"
  - "src/pages/api/*/message.ts"
  - "src/app/components/Game*"
  - "src/app/components/useGame*"
  - "src/data/game*"
  - "packages/shared/src/game*"
  - "packages/shared/src/useGameSession.ts"
  - "scripts/simulate-games.ts"
  - "apps/mobile/src/useGameController.ts"
---

### Guessing games: one engine, two definitions

"Guess Who" and "Guess Who's Next" are **one engine with two `GameDefinition`s**; a game change is
one edit reaching web, mobile, and both games. Only what genuinely differs lives in a definition.

- **`packages/shared/src/game.ts`** holds `GUESS_WHO`/`GUESS_WHO_NEXT` (`GAMES`, `GAME_LIST`,
  Guess Who first) and the pure logic: response parsing, `applyGameMessageResponse`,
  `revealGameMessages`, and `createGameTransport(game, io)` (URLs, per-game wire token name,
  validation over a platform's raw `get`/`post`/`round` primitives). `useGameSession.ts` is the one
  client state machine. A definition carries `slug`, `tokenField`, `eventPrefix`, `hidesSpeaker`,
  `storageKeys`, and `copy` (`gameCopy.ts`).
- **`hidesSpeaker` is the one behavioral difference.** `false` (Guess Who's Next): a named, shown
  character steers toward a *different*, hidden one. `true` (Guess Who): the character you chat
  with *is* the mystery; its name and avatar are generated eagerly but live only in the encrypted
  token until a correct guess, second wrong guess, or give-up. The header shows a silhouette and
  "???" until then, and **a reveal retroactively rewrites the round's already-shown transcript**
  (`revealGameMessages`).
- **Server: one implementation per endpoint under `src/pages/api/[game]/`** (`start`, `continue`,
  `message`, `give-up`, `high-score`, `leaderboard`, `leaderboard-settings`), wrapped by
  `src/utils/game/route.ts`'s `gameRoute` (resolves `[game]`, 404 otherwise, per-game-per-endpoint
  limiter `<slug>-<endpoint>`, request log). One `@swagger` block per route covers both games via a
  shared `Game` path parameter. `src/utils/game/` holds `definitions.ts` (slug lookup, score
  tables; no Claude imports), `token.ts`, `round.ts` (`planRound`, `generateGameRound`), and
  `scores.ts` (parameterized on `game.tables`).
- **The wire format is unchanged on purpose.** Each game keeps its historical token field
  (`guessWhoToken`/`gameToken`), URLs, response fields, and analytics event names
  (`guess_who_*`/`guess_who_next_*`) so released mobile builds keep working. Clients normalize to
  `token` at the boundary.
- **One token payload** (`GameState`: `speakerName`, `targetName`, equal in Guess Who) with a
  **`game` discriminator so a token never verifies against the other game's routes.**
- **Persisted client state keeps its on-disk layout** (token under `storageKeys.token`, the rest as
  JSON under `storageKeys.transcript`) so older saves resume. The platform controllers
  (`useGameController.ts` on web, `apps/mobile/src/useGameController.ts`) supply only transport,
  storage, logger, audio, and (web) SSE progress. `GamePage.tsx`/`GamePage.module.css` and
  `GameScreen.tsx` (exporting `GuessWhoScreen`/`GuessWhoNextScreen`) are one component each.
- **`src/utils/classifyGuess.ts`** is the classifier both games share (few-shot examples live once).
- **DB tables stay separate per game** (`guess_who_*`, `guess_who_next_*`): selected by config, and
  merging would add a production migration for almost no code saved. `schema.ts` keeps them
  explicit because `scripts/check-db-schema.cjs` regex-scans it.
- **Tests run each shared flow once per game** (`describe.each`); fixtures in
  `tests/helpers/gameRoute.ts`.

### Game mechanics shared by both games

- **Round state lives in a signed, encrypted, opaque token, not a DB row.** `GameState` carries the
  names, the current persona prompt, avatar/gender/voiceConfig, streak, wrong-guess count, and
  `usedNames` (no repeats). `signGameState`/`verifyGameState` wrap it in one AES-256-GCM token the
  client echoes on every call. This keeps the hidden name unreadable to the client and keeps
  gameplay working for guests with no database.
- **The key derives from `GAME_TOKEN_SECRET ?? NEXTAUTH_SECRET ?? API_SECRET`** (`getKey()`), never
  a per-process random key, so it's stable across Vercel instances with no new required config.
  Only a deliberate rotation invalidates a run, degrading to a friendly "start a new game" 400.
- **Tokens are stateless, so a run's end is recorded server-side.** Old tokens stay decryptable and
  give-up reveals the answer, so replaying one would turn the reveal into a scored win. Give-up and a
  second wrong guess call `markRunEnded` (sets `ended_at` on the run's `*_results` row, inserting a
  0-streak row if none exists); a correct guess skips scoring when `isRunEnded`. Known limit: a
  first-wrong token can still be replayed for extra wrong guesses (no server-side strike count).
  A hidden-speaker game's `/api/audio` URL is built with a neutral `botName` and no `gender`
  (`synthesizeReplyAudio`'s `hideIdentity`), or the URL would hand over the answer.
- **`verifyGameState()` fails CLOSED** (any tamper, malformed input, or decrypt failure returns
  `null` and `message.ts` returns a hard 400), the one deliberate exception to this codebase's
  usual fail-open convention.
- **Character, avatar, and voice pipelines are shared with ordinary bot creation** and called
  in-process: `pickRandomCharacterName.ts`, `avatarGeneration.ts`'s `getOrGenerateAvatar`, and
  `characterVoices.ts`'s `getVoiceConfigForCharacter`. An avatar/voice is only resolved for the
  character actually shown, never the hidden one (no spoiler).
- **`generateGameRound(currentCharacterName, excludeNames, onProgress?)`** (`round.ts`) is the one
  place the persona → avatar → opening reply → voice → TTS sequence lives, for both `start.ts` and
  `continue.ts`. It runs `[persona ‖ avatar] → [opening reply ‖ voice config] → TTS`.
- **`gameReply.ts`** has the three Claude-call shapes: `getGameReply` (an in-character turn, with
  optional `extraInstruction`), `getOpeningReply` (never throws, falls back), and
  `getGuessReactionReply` (the confirm/deny/reveal line after a guess is judged; never throws). The
  reaction call gets only the authoritative outcome and canonical revealed name, never the raw
  guess, so correctness is settled once and a second model call can't contradict the banner. The
  never-throws guarantee matters on a correct guess: a Claude hiccup building the *next* greeting
  must not turn a win into a 500.
- **Generating the next character is deferred until "Continue."** `message.ts`'s correct branch
  only judges and returns the reaction plus the new streak; `continueRound()` in the controller
  calls `continue.ts` (which reads the still-valid token for `nextCharacterName`/`usedNames` and
  runs `generateGameRound`). `continue.ts` refuses to advance until the token's `canContinue` is
  true (set only by a judged-correct response). On failure the "Correct!" banner is restored with an
  error so the player can retry.
- **The "Correct!" moment is an inline banner, not a modal** (a modal obscured the last message).
  `GamePage.tsx`'s `bannerContent` slot sits above the transcript; `awaitingContinue` is derived
  from `lastEvent?.type === "correct"`. After Continue, the same staged progress spinner as the
  start screen replaces it, and the input stays disabled
  (`apiAvailable={!awaitingContinue && !continuing}`).
- **Progress is real, server-reported SSE, not a timer.** `start.ts`/`continue.ts` accept
  `stream: true` and write `data: {"stage": "personality"|"avatar"|"reply"|"voice", "done": false}`
  frames as each step completes, then a final `done: true` frame with the normal response fields.
  `useGameRoundProgress.ts`'s `fetchRoundWithProgress` (`readSseFrames`) shows the first stage not
  yet complete (pairs resolve in either order) and holds on "Preparing greeting…" until the final
  frame. This is the app's first real SSE consumer.
- **`roundStartIndex` must be an absolute index into the full `messages` array** (the index of the
  current round's first message). `sendMessage` sends `messages.slice(roundStartIndex)` as history.
  `continueRound()` captures `messages.length` *before* appending the new greeting. An earlier
  off-by-offset bug only worked on the first round switch;
  `tests/app/components/useGuessWhoNextController.test.ts` plays three consecutive switches.
- **Replay keeps each speaker's voice.** Every transcript message pins its round's avatar and
  gender; a message with no `audioFileUrl` (its TTS failed) is replayed via
  `packages/shared/src/replayAudio.ts`'s `findSpeakerVoiceConfig`, which recovers the speaker's
  cast `voiceConfig` from another message's audio URL before falling back to a bare regeneration
  (a fresh context-free cast once gave a male speaker a female voice). Web and mobile both use it.
- **"Back to Home" ends the run** (`quitGame()`); there is no separate Quit.
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

### Game simulator (`npm run sim:games`)

`scripts/simulate-games.ts` plays both games in-process with an LLM player (`--player strong|weak|adversarial`,
`--game`, `--concurrency`, `--max-turns`; **hard-limited to one round per game, concurrency 2, 6 turns by default (10 max), and it refuses to run unless a human sets `ALLOW_PAID_SIM=1`**; the local `.claude/settings.local.json` also denies Claude Code from launching it) and reports
win rate, pacing, wasted turns (an "ambiguous" the player had to repeat), name leaks, and
fourth-wall mentions, writing transcripts to gitignored `sim-output/`. It skips avatar, voice, TTS,
and the DB. **It costs real Anthropic money:** each turn is three or four calls and ~400 rounds
cost enough that the user stopped the work (~230 rounds yielded three real bugs, a leak, a two-name
win and a persona mismatch; most of the spend only confirmed prior findings). Read prompts and scan
name lists first; use real-player data (`analytics_events`, `/admin`) for difficulty questions, since
an LLM player knows far more than a human; one round per game is the cap, and Claude must not run it unprompted. `NODE_ENV=production`
makes chat replies use Sonnet like prod (the classifier is Haiku either way). Findings so far: all
players mostly win and the strong player wins in 2 to 3 turns, so difficulty is the open question.

### Guess Who (self-describing chat game)

`/guess-who` is the default game wherever both appear. The player chats with a mystery character
that never reveals its name and drops escalating real clues about itself. One wrong guess per
round is tolerated; a second ends the run. `generateGuessWhoSelfCluePersonaPrompt(name, work?)`
(`serverConfig.ts`) is the inverse of `generateGameCluePersonaPrompt`: first person, never names
itself, escalates from a broad self-description to specific checkable facts within a couple of
exchanges, grounded in `gameCharacterWork.ts`. Its opening uses `SELF_CLUE_OPENING_INSTRUCTION`
(`gameReply.ts`), never the default "introduce yourself" line (which gave the name away). Scores use
the `guess_who_*` tables; `/leaderboard` shows both top tens as tabs.

### Guess Who's Next (conversation game)

The player chats with a real, NAMED, shown character who talks as itself but steers toward a
*different, hidden* figure. **Don't invert this:** the character you chat with is never the
mystery, and there is no separate guess control; the server classifies every typed message as
`"clear"` guess, `"ambiguous"` (the character asks in character to confirm), `"giveUp"`, or
`"none"` (ordinary question). One wrong guess per hidden target is tolerated; a second ends the
run, or the player gives up (menu or typed) and is always told the answer. A correct guess reveals
the target and holds on "Continue," after which **the revealed figure becomes the new chat partner**
and steers toward a fresh hidden target, building a streak. TTS plays for every reply.

- **`generateGameCluePersonaPrompt(currentCharacterName, nextCharacterName)`** (`serverConfig.ts`)
  reuses `generatePersonalityPrompt` for the speaker and appends rules: steer toward the target
  without naming it; never claim not to know it or refuse it as being from another time/place (the
  pool spans eras and universes); the opening greeting includes one real, narrowing category-level
  fact ("a queen from ancient Egypt"), not pure mood; follow-ups escalate to a specific checkable
  fact within a couple of exchanges. This was deliberately made easier (issue #878, "game is too
  hard"): a contentless hint reads as stalling, and the prompt favors players finishing with long
  streaks over unsolvable rounds.
- **`start.ts`** picks both names, builds persona + avatar + voice, and returns the greeting (with
  audio), the token, and `currentCharacterName`. **`message.ts`** verifies the token, classifies
  (a Haiku classifier that also judges correctness when `"clear"`), then replies normally, asks for
  confirmation, tolerates-once-then-ends on a second wrong guess, or returns the reaction and new
  streak on a correct one.
- **Personal high score:** `guess_who_next_high_scores` (`(user_id, environment)` PK) holds a
  signed-in user's best streak. `updateHighScoreIfBeaten` runs fire-and-forget from `message.ts`'s
  correct branch (a Postgres upsert with a `setWhere` guard `highScore < newStreak`, so a racing
  write can't lower it); it fires once at judgment time, not on Continue. `GET .../high-score`
  returns `{ highScore: null }` with no DB (a guest gets its cookie-bound best from
  `guess_who_next_results`); `useGameController.ts` fetches it once on sign-in and bumps it
  optimistically with `Math.max`, so "Best: N" shows for guests too. **A new table needs `db:push`
  before it works live;** `db:check` treats a wholly-missing table as not-a-drift, so it's easy to
  forget.
- **Public leaderboard:** `guess_who_next_results` has one row per run (`id` = the token's `runId`,
  exactly one of `user_id`/`guest_id`, `environment`-scoped, `bestStreak` raised only via a guarded
  upsert). A guest's identity is a random 32-byte token in the HTTP-only `portrayal-game-guest`
  cookie, SHA-256-hashed before storage (`gameGuestIdentity.ts`; `ensureGuestId` mints at start,
  `getGuestId` only reads). `recordGameResult` runs on the correct branch for signed-in and guest
  runs, only when the token's issuance (`issuedForUserId`/`issuedForGuestId` plus `environment`)
  still matches the caller, so a copied token can't credit anyone. `getLeaderboard` ranks account
  bests plus per-guest bests together (private scores count for ranking only) and publishes only
  the opted-in top ten, one entry per account/guest. Opting in goes through
  `GET`/`POST .../leaderboard-settings`: top-ten eligibility is rechecked server-side and the name
  passes `checkLeaderboardName` (length/script rules plus a Claude moderation call that fails closed
  to `unavailable`). A player can change their public name anytime.
- **Analytics** (`analyticsEvents`): `game_started`, `game_guess_correct`, `game_guess_wrong` (both
  carry `turn`, the round's exchange number, which `/admin` averages as "turns to solve"),
  `game_round_continued`, `game_run_ended` (reason `second_wrong` or `give_up`); see "Internal
  analytics".
