// This middleware restricts API access to only allowed origins (local dev and Vercel prod)
import { NextRequest, NextResponse } from 'next/server';

const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://character-chatbot-generator.vercel.app',
    // Allow Vercel preview deployments (they have random subdomains)
    /^https:\/\/character-chatbot-generator-[a-z0-9]+-andylacroces-projects\.vercel\.app$/,
];

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
        return new NextResponse('Forbidden', { status: 403 });
    }
    return NextResponse.next();
}

export const config = {
    matcher: ['/api/:path*'],
};
