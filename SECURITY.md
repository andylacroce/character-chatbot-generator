# Security Policy

## Supported versions

Only the latest release on `main` (the deployed web app) and the current build of the mobile app
(`apps/mobile`) receive security fixes.

## Reporting a vulnerability

Please report privately, not in a public issue or pull request.

- Preferred: [open a private security advisory](https://github.com/andylacroce/character-chatbot-generator/security/advisories/new)
  on GitHub.
- Alternative: email <portrayal-support@andrewlacroce.com> with "Security" in the subject.

Include what you found, steps to reproduce, and the impact you expect. Please don't include
real user data, and don't test against other people's accounts.

This is a solo-maintained project. Expect an acknowledgement within about a week and a fix or
status update as soon as practical after that. You're welcome to be credited in the changelog;
tell me if you'd rather stay anonymous.

## Scope

In scope: the production web app, its `/api/*` routes, the mobile app, and this repository's code
and CI workflows (for example auth bypasses, cross-user data access, leaked secrets, or ways to run
up third-party API costs beyond the documented rate limits).

Out of scope: denial of service by raw traffic volume, findings that require a compromised device
or browser, missing best-practice headers with no demonstrated impact, and issues in third-party
services (Anthropic, Google Cloud, Vercel, Neon, Cloudflare, Pollinations) that should go to those
vendors.

Known, accepted tradeoffs (for example that `proxy.ts`'s Origin check is CSRF protection rather
than authentication, and that the mobile app's API key is extractable from the APK) are documented
in [CLAUDE.md](CLAUDE.md) under "Security posture". Reports that only restate these aren't
vulnerabilities, though a way to make them worse is.

## Good faith

If you act in good faith, avoid privacy violations and service disruption, and give me reasonable
time to fix an issue before disclosing it, I won't pursue action against you.
