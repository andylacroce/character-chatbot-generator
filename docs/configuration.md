# Configuration

Every account and environment variable the app can use. Only Anthropic and Google Cloud are required; everything else is optional and the app degrades gracefully without it. `.env.example` lists the same variables with placeholders.

## External Services & Accounts

Everything below is an **account you'd need to create**, not just an env var to fill in — grouped by what breaks without it, so you can tell up front what's actually required versus what only enables one optional feature.

| Service | Sign up at | Required? | Enables | Env vars |
| --- | --- | --- | --- | --- |
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | **Required** | Chat replies, personality/avatar-prompt/voice-config generation, copyright & profanity validation — the app can't run at all without this | `ANTHROPIC_API_KEY` |
| **Google Cloud Platform** | [console.cloud.google.com](https://console.cloud.google.com) | **Required** | Text-to-Speech (voice replies), via a service account — see [Getting started](getting-started.md) | `GOOGLE_APPLICATION_CREDENTIALS_JSON` |
| **Cloudflare** | [dash.cloudflare.com](https://dash.cloudflare.com) | Optional | Primary (free-tier) avatar image provider (Workers AI, Flux Schnell). Skip it and avatar generation still works via the Pollinations.ai fallback with no config at all | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` |
| **Neon** (Postgres) | [neon.tech](https://neon.tech) | Optional | Server-side persistence: saved characters, chat history, the shared avatar cache table. Skip it and the app is a fully-functional guest-only experience | `DATABASE_URL` |
| **Google Cloud Console → OAuth credentials** | Same GCP project as above, but a *separate* setup step (APIs & Services → Credentials → OAuth client ID) — not the service account key | Optional | "Sign in with Google" on the landing page. Needs `DATABASE_URL` set too, or there's nothing to sign in *for* | `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **Google Analytics** | [analytics.google.com](https://analytics.google.com) | Optional | Consent-gated GA4 page views. The Google tag never loads before a visitor opts in | `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` (optional override) |
| **Any SMTP sender** (Gmail App Password, Resend, etc.) | No new account needed if you already have an inbox you can send mail from | Optional | Passwordless magic-link sign-in alongside Google. Needs `DATABASE_URL` set too | `EMAIL_SERVER`, `EMAIL_FROM` |
| **Vercel** | [vercel.com](https://vercel.com) | Optional | Deployment target, plus two of its own add-ons if you want them: **Blob** storage (durable avatar URLs instead of base64 data URLs) and **KV**/Marketplace Redis (shared rate-limit counters across serverless instances) | `VERCEL_BLOB_READ_WRITE_TOKEN`, `KV_REST_API_URL` + `KV_REST_API_TOKEN` |
| **Upstash** (Redis) | [upstash.com](https://upstash.com) | Optional | Same shared-rate-limit feature as Vercel KV above, if you'd rather provision Redis directly instead of through Vercel's marketplace | `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` |

**Minimum to run locally as a guest**: just Anthropic + Google Cloud. Everything else in the table is additive — the app degrades gracefully (never crashes, never 401s) with any or all of it unset.

## Environment Variables

### Required

- `ANTHROPIC_API_KEY` — Anthropic API key for chat and avatar prompt generation
- `API_SECRET` — Server-side API secret for request authorization
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` — Full GCP service-account JSON key, inline (for Text-to-Speech)

### Optional

- `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID` — Overrides the production site's built-in GA4 measurement ID, or enables the consent flow during local development. Use a web data stream's `G-...` ID; the Google tag is not loaded until a visitor explicitly opts in, and client-side route changes are tracked automatically when GA4 Enhanced Measurement has browser-history page changes enabled.
- `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` — Enables Cloudflare Workers AI (Flux Schnell) as the primary avatar image provider. Without them, avatar generation still works via the Pollinations.ai fallback with no config at all
- `VERCEL_BLOB_READ_WRITE_TOKEN` (or `BLOB_READ_WRITE_TOKEN`) — Enables logging to Vercel Blob storage, and durable Blob-hosted avatar URLs instead of base64 data URLs
- `KV_REST_API_URL` + `KV_REST_API_TOKEN` — Redis REST endpoint (Vercel KV / Marketplace Redis) used to share API rate-limit counters across serverless instances. `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` work too. With neither pair set, limits fall back to an in-process counter, which is per-instance on Vercel and exactly right for local development.
- `DATABASE_URL` + `NEXTAUTH_SECRET` + `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — Enables optional Google account sign-in and server-side persistence (see [Account Persistence](features.md#account-persistence-optional) below). The app is fully functional as a guest with none of these set.
- `EMAIL_SERVER` + `EMAIL_FROM` — Enables passwordless magic-link sign-in alongside Google (a plain SMTP connection string works — Gmail App Password, Resend, etc.). Needs `DATABASE_URL` set too.
- `GAME_TOKEN_SECRET` — Key used to encrypt both guessing games' round tokens (see [Guessing Games](features.md#guessing-games) below). Falls back to `NEXTAUTH_SECRET`, then the already-required `API_SECRET`, so both games work with zero new configuration.
- `ADMIN_EMAILS` — Comma-separated allowlist of emails allowed to view the internal `/admin` stats page (see [Internal Analytics](features.md#internal-analytics-admin) below). With none set, nobody is admin. Never honored on a Vercel Preview deployment regardless of this value.
