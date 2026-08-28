// This proxy restricts API access to only allowed origins (local dev and Vercel prod)
// and requires a valid API key for API routes from external origins.
import { NextRequest, NextResponse } from 'next/server';
import { logEvent, sanitizeLogMeta } from './src/utils/logger';

// Hosts (host header / URL authority, i.e. hostname plus optional port) that are
// treated as first-party. Matching is host-exact on purpose: a substring or prefix
// match would let `character-chatbot-generator.vercel.app.attacker.com` through.
// Adding a new deployment domain means adding a pattern here — nowhere else.
const localHostPattern = /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const allowedHosts = [
    localHostPattern,
    'character-chatbot-generator.vercel.app',
    // Vercel preview deployments (they have random subdomains)
    /^character-chatbot-generator(?:-git)?-[a-z0-9-]+-andylacroces-projects\.vercel\.app$/,
];

// Requests that cannot change server state and cannot spend money on an upstream
// model call. Browsers omit `Origin` on same-origin GET/HEAD, so those are the only
// methods allowed to fall back to the (weaker) host check.
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Exact host match against the allow list. Never prefix/substring based.
 */
function isAllowedHost(host: string): boolean {
    if (!host) return false;
    return allowedHosts.some((allowed) =>
        typeof allowed === 'string' ? host === allowed : allowed.test(host),
    );
}

/**
 * Parses an Origin (or Referer) header and checks the resulting origin against the
 * allow list. Parsing rather than string-matching means a path, query or userinfo
 * section in a Referer cannot be used to smuggle an allowed host into the comparison.
 */
function isAllowedOrigin(value: string): boolean {
    let url: URL;
    try {
        // Rejects the opaque `Origin: null` sent by sandboxed iframes, and anything
        // that is not a parseable absolute URL.
        url = new URL(value);
    } catch {
        return false;
    }
    if (!isAllowedHost(url.host)) return false;
    // Plain http is only acceptable for local development.
    return localHostPattern.test(url.host)
        ? url.protocol === 'http:' || url.protocol === 'https:'
        : url.protocol === 'https:';
}

export function proxy(req: NextRequest) {
    // Auth.js's own routes (sign-in, OAuth callback, session, CSRF token) are protected
    // by their own signed, httpOnly state/CSRF cookies, not this app's origin/API-key
    // scheme. The callback in particular is a top-level browser navigation *from* the
    // OAuth provider (e.g. accounts.google.com), so it arrives with that provider's own
    // Referer/Origin and can never carry a first-party one or this app's API key.
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/auth/')) {
        return NextResponse.next();
    }

    // Check API_SECRET at runtime instead of build time
    const apiSecret = process.env.API_SECRET;
    if (!apiSecret) {
        logEvent('error', 'api_secret_missing', 'API_SECRET environment variable is not set', {});
        return new NextResponse('Server configuration error', { status: 500 });
    }

    // Since the matcher is set to /api/:path*, this proxy only runs for API routes
    const origin = req.headers.get('origin') || req.headers.get('referer') || '';
    const host = req.headers.get('host') || '';
    const method = (req.method || 'GET').toUpperCase();

    // Browsers always send Origin on POST, so a missing Origin means a non-browser
    // client. Those may only reach read-only routes on a first-party host; anything
    // else still has to present the API key below.
    if (origin === '') {
        if (safeMethods.has(method) && isAllowedHost(host)) {
            return NextResponse.next();
        }
    } else if (isAllowedOrigin(origin)) {
        // For API routes from allowed origins, allow the request
        return NextResponse.next();
    }

    // For API routes from external origins, require API key
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== apiSecret) {
        logEvent('warn', 'api_key_invalid', 'API request blocked due to invalid or missing API key', sanitizeLogMeta({
            apiKey: apiKey ? '[PRESENT]' : '[MISSING]',
            origin,
            host,
            method,
            userAgent: req.headers.get('user-agent'),
            url: req.url,
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        }));
        return new NextResponse('Unauthorized', { status: 401 });
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/api/:path*'],
};
