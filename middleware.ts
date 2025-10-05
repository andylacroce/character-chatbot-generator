// This middleware restricts API access to only allowed origins (local dev and Vercel prod)
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

    const isAllowedOrigin = allowedOrigins.some((allowed) => {
        if (typeof allowed === 'string') {
            return origin.startsWith(allowed);
        } else {
            return allowed.test(origin);
        }
    });

    // For API routes from allowed origins, skip API key validation (our app's own requests)
    if (req.nextUrl.pathname.startsWith('/api/') && isAllowedOrigin) {
        return NextResponse.next();
    }

    // For API routes from external origins, require API key
    if (req.nextUrl.pathname.startsWith('/api/') && !isAllowedOrigin) {
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

    // For non-API routes, check origin
    if (!isAllowedOrigin) {
        logEvent('warn', 'origin_blocked', 'Request blocked due to disallowed origin', sanitizeLogMeta({
            origin,
            host,
            userAgent: req.headers.get('user-agent'),
            url: req.url,
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        }));
        return new NextResponse('Forbidden', { status: 403 });
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/api/:path*'],
    runtime: 'nodejs',
};
