// This middleware restricts API access to only allowed origins (local dev and Vercel prod)
import { NextRequest, NextResponse } from 'next/server';

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://your-app.vercel.app', // <-- Replace with your actual Vercel domain
];

export function middleware(req: NextRequest) {
  const origin = req.headers.get('origin') || req.headers.get('referer') || '';
  if (!allowedOrigins.some((allowed) => origin.startsWith(allowed))) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
