---
paths:
  - "src/utils/storage.ts"
  - "packages/shared/src/storageKeys.ts"
  - "src/app/components/account/useUserName.ts"
  - "src/app/components/account/NameCaptureModal.tsx"
  - "src/app/api/user-profile/route.ts"
---

### Client-side storage

`src/utils/storage.ts` wraps `localStorage` with an in-memory fallback (used in tests). Keys
(`packages/shared/src/storageKeys.ts`): `chatbot-bot`, `chatbot-history-<bot.name>`,
`voiceConfig-<bot.name>` (versioned; use the versioned helpers, never write the shape directly),
`audioEnabled`, `darkMode`, `bot-session-id`, `chatbot-user-name` and
`chatbot-user-name-gate-skipped` (see "Personalized greeting"), the games' token/state/
instructions-seen keys (see the game sections), `chatbot-landing-carousel-cache`, and
`portrayal-google-analytics-consent` (web-only `granted`/`denied`, never an identifier). Never store
secrets or PII here.

### Personalized greeting (the visitor's own name)

Separate from accounts: the app tracks what a character should call the *human*.
`users.preferredName` is deliberately distinct from Auth.js's `users.name` (from the OAuth profile,
used only for the "Sign out (X)" label); this one is explicit and user-typed.

- **Capture is a one-time gate, not a standing field.** `useBotCreation.ts`'s `handleCreate()`
  pauses (`showNameGateModal`) the first time a browser submits with no name known
  (`userNameCtx.isResolved && !name && !hasSkippedGate`) and shows `NameCaptureModal`
  (`mode="gate"`): "Continue" saves and resumes, "Skip for now" sets
  `chatbot-user-name-gate-skipped` and resumes. One insertion point covers every `handleCreate()`
  caller (form, modal continuations, `?name=` auto-launch). A masthead icon and a stacked field were
  tried and rejected (missed, or cluttered the main flow).
- **Editable anytime** via the account menu ("Add your name"/"Change your name", `mode="edit"`).
- **Guest:** localStorage only (`chatbot-user-name`, `chatbot-user-name-gate-skipped`);
  `useChatController.ts` sends it as `userName` on every `/api/chat`.
- **Signed in:** `src/app/api/user-profile/route.ts` (`GET`/`POST`) persists to `users.preferredName`;
  `useUserName.ts` seeds the DB once from a pre-existing guest value on first sign-in.
- **Server precedence (`chat.ts`):** for a signed-in user the DB value wins once set (server
  authoritative, like `personality` for a saved bot), so a request can't spoof another name;
  otherwise the client's `userName` (sanitized by `sanitizeUserName`, which keeps apostrophes and
  hyphens unlike `sanitizeCharacterName`). When present it goes in the system prompt as a
  `<user_name>` block (same prompt-injection mitigation as `<character_persona>`) and into the reply
  cache key, so differently-named users can't get a cross-contaminated cached greeting.
- **Shown in the transcript:** `ChatMessage.tsx` shows the visitor's name instead of "Me" (threaded
  from one `useUserName()` in `ChatPage.tsx`), updating live; `downloadTranscript.ts` and
  `transcript.ts` accept `userName` too. Optional everywhere; not part of the `messages` table.
- **Sign-in shares one `SignInModal` per page** between `NameCaptureModal` (via `onRequestSignIn`)
  and `useAccountMenu`'s `AuthControl`, rendered as a sibling of the header. Rendering it inside the
  hamburger dropdown let `HamburgerMenu.module.css`'s `.menuDropdown button` reset strip the
  buttons' styling, since a `position: fixed` modal is still a DOM descendant.
