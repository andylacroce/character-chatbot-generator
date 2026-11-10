---
paths:
  - "src/utils/game/**"
  - "src/pages/api/*/start.ts"
  - "src/pages/api/*/continue.ts"
  - "src/pages/api/*/message.ts"
  - "src/app/components/game/**"
  - "src/data/game*"
  - "packages/shared/src/game*"
  - "packages/shared/src/useGameSession.ts"
  - "scripts/simulate-games.ts"
  - "apps/mobile/src/useGameController.ts"
---

### Guessing games: one engine, two definitions

"Guess Who" and "Guess Who's Next" are **one engine with two `GameDefinition`s**; a game change is
one edit reaching web, mobile, and both games. Only what genuinely differs lives in a definition.

- **`packages/shared/src/game*.ts`** (`game.ts` is a barrel over `gameDefinitions.ts`, `gameState.ts`, and
  `gameTransport.ts`) holds `GUESS_WHO`/`GUESS_WHO_NEXT` (`GAMES`, `GAME_LIST`,
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
- **"Back to Home" ends the run** (`quitGame()`) after a web-only "Leave this run?" confirm (`leaveConfirm` copy); mobile never quits on leaving, state persists. There is no separate Quit.
