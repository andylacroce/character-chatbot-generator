---
paths:
  - "src/pages/api/report.ts"
  - "src/pages/api/admin/reports.ts"
  - "src/utils/moderation/contentReports.ts"
  - "src/app/components/common/ReportDialog.tsx"
  - "src/app/components/common/ModalImageViewer.tsx"
  - "src/app/admin/moderation/ReportsSection.tsx"
  - "src/app/characters/[slug]/ReportCharacterButton.tsx"
  - "packages/shared/src/report.ts"
  - "apps/mobile/src/components/ReportModal.tsx"
---

### Report a problem

Users can report a character (its name or portrait) or one reply a character gave. The feature is
called "Report a problem", not "report abuse": most reports are about content (an offensive
portrait, a wrong reply), not about another user. Keep that wording in UI, routes, and tables.

- **Shared (`packages/shared/src/report.ts`):** the reasons (`offensive`, `image`, `inaccurate`,
  `copyright`, `other`), limits (`REPORT_DETAILS_MAX` 500, `REPORT_MESSAGE_MAX` 1000), all copy
  (`REPORT_COPY`), and `useReportForm`, the form state machine both platforms wrap. A new reason
  is one entry in `REPORT_REASONS`; the API validates against the same list.
- **`POST /api/report`** (`src/pages/api/report.ts`, 5/min/IP): body `{ targetType: "character" |
  "message", characterName, reason, details?, messageText? }`. Open to guests; the reporter's id is
  stored only when signed in (`getSessionUserId`). The name is trimmed and capped but **not**
  passed through `sanitizeCharacterName` (it strips apostrophes, and an admin acts on this exact
  name). A `message` report requires `messageText`, which is copied at report time because guest
  chat history is client-side only. It returns 503 when the report couldn't be stored (no
  `DATABASE_URL`, or the table is missing), so the dialog shows an error instead of a false
  "thanks".
- **`content_reports` table** (`src/db/schema.ts`; helpers in `utils/moderation/contentReports.ts`,
  `safeDb`-wrapped like the other moderation aids): environment-scoped like `bots`, `status` is
  `open` until resolved. `reporter_user_id` is `set null` on user delete, deliberately not
  `cascade`: erasing an account must not erase a report a moderator may still need, and the row
  then holds no link back to the person (this is the documented exception to the "per-user table
  cascades" rule in `account.md`). **Rollback:** the table is purely additive and nothing else
  references it; reversing is `DROP TABLE content_reports`, and old code ignores it. Apply with
  `npm run db:push` (until it runs, every report 503s). `db:check` only compares columns of known
  tables it parses from `schema.ts`; a missing table surfaces as that 503, so run `db:push` when
  this table first ships to an environment.
- **Admin queue:** `/admin/moderation` shows `ReportsSection.tsx` above "Recently warned"
  (`GET /api/admin/reports`, open reports in this environment, newest first). Each name links, in a
  new tab, to `/characters?name=`, which opens that portrait's lightbox with the admin controls; a
  reported reply is quoted inline (there is no per-message page). Actions reuse
  existing routes: **Block name** (`POST /api/admin/blocklist`, which scrubs the name everywhere),
  **Purge portrait** (`DELETE /api/admin/characters`), and **Dismiss**; each then resolves the
  report (`POST /api/admin/reports { id }`). Blocking or purging a name does not auto-resolve other
  open reports for it.
- **Where the entry points are (web):** the Wall lightbox and the character page report the
  character; the chat portrait viewer (`ModalImageViewer`'s `onReport`) reports the character; each
  character reply in a transcript has a flag button (`ChatMessage`'s `onReport`, drilled through
  `ChatMessagesList`/`VirtualizedMessagesList`, owned by `ChatShell`, so the guessing games get it
  too). User messages are never reportable. The Wall lightbox is a top-layer `<dialog>`, which would
  cover a report dialog, so it closes first and `CharsGallery` opens `ReportDialog`.
- **Mobile parity:** `ReportModal.tsx` (wrapping `useReportForm` and `submitReport` in `api.ts`) is
  opened from `ChatView` (per-reply flag icon) and from `PortraitLightbox`'s `onReport` in
  `CharWallScreen`, `ChatScreen`, and `GameScreen`. The lightbox closes before the report modal
  opens (iOS can't stack modals).
- **Not covered:** the landing carousel and transcripts downloaded to a file. Add an entry point
  only where a user can see content they could reasonably want removed.
- **Privacy:** the policy page discloses that reports (including the reported text and optional
  details) are stored for review. Keep it current if the fields change.
