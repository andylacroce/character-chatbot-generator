---
paths:
  - "src/pages/api/chat.ts"
  - "src/pages/api/audio.ts"
  - "src/utils/tts*.ts"
  - "src/utils/chatContext.ts"
  - "src/utils/characterVoices.ts"
  - "src/utils/voiceHelpers.ts"
  - "src/app/components/useChatController.ts"
---

### Chat + streaming (`src/pages/api/chat.ts`)

The most complex endpoint: calls Claude, summarizes history once it exceeds 20 messages
(`src/utils/conversationSummarizer.ts`; a signed-in user's saved character differs, see "Account
persistence"), streams via SSE when the client passes `{ stream: true }`, and does "smart
continuation": it detects a truncated reply, appends "Would you like me to continue?", and resumes
if the user says yes.

SSE frames are plain `data: JSON\n\n`. The final payload is
`{ reply: string, audioFileUrl?: string, done: true }`; changing it requires updating
`useChatController.ts` and every test that parses stream frames.

- **TTS** (`src/utils/tts.ts`, `synthesizeSpeechToFile`) is keyed by a stable content hash
  to avoid re-synthesizing identical audio. `ttsReply.ts`'s `synthesizeReplyAudio` is the one pipeline
  (hash-named mp3 plus `.txt` sidecar, `/api/audio` URL) for chat on every path and both games; never
  inline a second copy. `tests/integration/audioRoundTrip.test.ts` pins it against the real audio route.
  `chatContext.ts` holds the history/summary resolution and system-prompt assembly for `chat.ts`. A TTS failure on any path (cache hit,
  non-streaming, streaming) never fails the chat request: it degrades to a text-only reply
  (`audioFileUrl` omitted), since losing audio beats discarding a generated reply.
- **Voice shapes:** persisted configs use Google's `Voice` response shape (`languageCodes`), but
  synthesis builds the separate v1 `VoiceSelectionParams` explicitly (`languageCode` plus exact
  `name`), and sends no `ssmlGender` with a named voice, so stale gender metadata can't make Google
  reject a valid selection. The legacy mismatch self-heal remains only for an unnamed fallback.
- **Voice casting** (`src/utils/characterVoices.ts`) asks the `text-simple` model to infer a
  provider-neutral vocal profile from the personality, then requires the final `voiceName` to come
  from the deployment's live `ListVoices` inventory (cached once per warm process; Google's
  metadata for the chosen name is authoritative; casting never calls `SynthesizeSpeech` just to
  validate). Studio, Neural2, WaveNet, Standard, News, Journey, and Polyglot stay eligible; mature
  v1/SSML controls are preferred over migrating to a newer, less configurable family. The result
  cache includes a hash of the personality context so a corrected or disambiguated name can't
  reuse an incompatible voice.
