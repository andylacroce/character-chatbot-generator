// This middleware restricts API access to only allowed origins (local dev and Vercel prod)
// and requires a valid API key for API routes.
import { NextRequest, NextResponse } from 'next/server';
import logger, { logEvent, sanitizeLogMeta } from './src/utils/logger';

const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://character-chatbot-generator.vercel.app',
    // Allow Vercel preview deployments (they have random subdomains)
    /^https:\/\/character-chatbot-generator-git-[a-z0-9-]+-andylacroces-projects\.vercel\.app$/,
];

const apiSecret = process.env.API_SECRET;
if (!apiSecret) {
    throw new Error('Missing API_SECRET environment variable');
}

export function middleware(req: NextRequest) {
    const origin = req.headers.get('origin') || req.headers.get('referer') || '';
    const host = req.headers.get('host') || '';

    // Allow requests without origin if they come from our own domain
    if (origin === '' && host.includes('vercel.app')) {
        return NextResponse.next();
    }

    if (!allowedOrigins.some((allowed) => {
        if (typeof allowed === 'string') {
            return origin.startsWith(allowed);
        } else {
            return allowed.test(origin);
        }
    })) {
        logEvent('warn', 'origin_blocked', 'Request blocked due to disallowed origin', sanitizeLogMeta({
            origin,
            host,
            userAgent: req.headers.get('user-agent'),
            url: req.url,
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        }));
        return new NextResponse('Forbidden', { status: 403 });
    }

    // Check API key for /api/* routes
    if (req.nextUrl.pathname.startsWith('/api/')) {
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
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/api/:path*'],
    runtime: 'nodejs',
};
