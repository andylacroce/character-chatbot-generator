// The API reference at /reference (@scalar/nextjs-api-reference) loads its UI
// bundle from jsdelivr and renders inline <style> tags, so script-src/style-src
// need to allow that CDN and 'unsafe-inline'. This isn't a nonce-based CSP —
// Next's App Router relies on inline scripts to hydrate RSC payloads, and wiring
// a per-request nonce through cleanly is a separate, larger change — so
// script-src keeps 'unsafe-inline' too. Still meaningfully narrows the attack
// surface versus no CSP: blocks framing, arbitrary object/embed, and any script,
// style, image, or fetch target outside this explicit allowlist.
const isDev = process.env.NODE_ENV !== 'production';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net",
  "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:",
  "img-src 'self' data: https:",
  "media-src 'self'",
  "connect-src 'self' https://cdn.jsdelivr.net",
  "object-src 'none'",
  "base-uri 'self'",
  // Auth.js's sign-in page submits a real <form> to /api/auth/signin/<provider>, which
  // the server 302s onward to that provider's consent screen. Chrome enforces
  // form-action against that final redirect target too, not just the form's own action
  // URL, so each provider's origin has to be explicitly allowed here or the redirect is
  // silently blocked with no visible error. Extend this list when adding another OAuth
  // provider — this bit Facebook's rollout before it was caught here, and was removed
  // again when Facebook sign-in itself was disabled (see authOptions.ts).
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizeCss: true,
  },
  serverExternalPackages: ['winston'],
  images: {
    // Avatars uploaded to Vercel Blob (pages/api/generate-avatar.ts) come back as
    // <random-store-id>.public.blob.vercel-storage.com URLs — the store id varies
    // per Blob store (local dev vs. prod use different tokens/stores), so this has
    // to be a wildcard rather than one fixed hostname.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
  // Performance optimizations
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
        ],
      },
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
