// This proxy restricts API access to only allowed origins (local dev and Vercel prod)
// and requires a valid API key for API routes from external origins.
import { NextRequest, NextResponse } from 'next/server';
import { logEvent, sanitizeLogMeta } from './src/utils/logger';

const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://character-chatbot-generator.vercel.app',
    // Allow Vercel preview deployments (they have random subdomains)
    /^https:\/\/character-chatbot-generator(?:-git)?-[a-z0-9-]+-andylacroces-projects\.vercel\.app\/?$/,
];

export function proxy(req: NextRequest) {
    // Check API_SECRET at runtime instead of build time
    const apiSecret = process.env.API_SECRET;
    if (!apiSecret) {
        logEvent('error', 'api_secret_missing', 'API_SECRET environment variable is not set', {});
        return new NextResponse('Server configuration error', { status: 500 });
    }

    // Since the matcher is set to /api/:path*, this proxy only runs for API routes
    const origin = req.headers.get('origin') || req.headers.get('referer') || '';
    const host = req.headers.get('host') || '';

    // Allow requests without origin if they come from our own domain or localhost
    if (origin === '' && (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('vercel.app'))) {
        return NextResponse.next();
    }

    const isAllowedOrigin = allowedOrigins.some((allowed) => {
        if (typeof allowed === 'string') {
            return origin.startsWith(allowed);
        } else {
            return allowed.test(origin);
        }
    });

    // For API routes from allowed origins, allow the request
    if (isAllowedOrigin) {
        return NextResponse.next();
    }

    // For API routes from external origins, require API key
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== apiSecret) {
        logEvent('warn', 'api_key_invalid', 'API request blocked due to invalid or missing API key', sanitizeLogMeta({
            apiKey: apiKey ? '[PRESENT]' : '[MISSING]',
            origin,
            host,
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
