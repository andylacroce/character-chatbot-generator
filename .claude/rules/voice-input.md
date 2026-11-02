---
paths:
  - "src/app/components/useSpeechRecognition.ts"
  - "src/app/components/ChatInput.tsx"
---

### Voice input (speech-to-text)

`useSpeechRecognition.ts` wraps the browser's native `SpeechRecognition`/`webkitSpeechRecognition`
(Chrome/Edge; absent in Firefox, inconsistent in Safari), deliberately not a server round-trip, so
it costs nothing and needs no route. It returns `isSupported`/`isRecording`/`transcript`/`error`
plus `startRecording`/`stopRecording`/`toggleRecording`; each integration point (ordinary chat and
the games' `ChatInput.tsx`, and `BotCreator.tsx`'s name field) owns its own wiring and all use
`normalizeDictatedText`.

- **The mic is a toggle** (click to start, click to stop), like the mute button. It renders only
  when `isSpeechSupported` and is hidden while `isAudioPlaying` (caps mobile icon buttons at 3).
  `BotCreator.tsx` has its own inline markup/CSS and hides it while busy.
- **`normalizeDictatedText`** only fixes capitalization and punctuation spacing. Real correction
  would need a Claude call, which breaks the zero-cost design.
- **Starting a recording overwrites the input** (avoids interim-result flicker). The controllers
  (`useChatController.ts`, `useGameController.ts`, `BotCreator.tsx`) sync the transcript into their
  input, force-stop on submit, and route speech errors to their own error banner. The game keeps its
  speech error in local state (`speechErrorDisplay`) because `useGameSession` has no settable error.
- **`next.config.mjs`'s `Permissions-Policy` allows `microphone=(self)`.**
- **Mobile has no voice input, a deliberate, evaluated gap (declined 2026-09-27).** The best Expo
  library (`expo-speech-recognition`) needs a custom dev client, which mobile avoids on purpose. The
  Expo-Go-compatible alternative (record → upload → Google Cloud Speech-to-Text, prototyped on a
  branch with AMR_WB on Android, LINEAR16 on iOS, and a 20s recording cap) was declined not for cost
  (~$0.002-0.003 per message) but because it sends a user's own recorded voice to a cloud API, a
  privacy tradeoff web's free native path never makes, for a feature nobody has asked for. Revisit
  either path if real demand appears.
