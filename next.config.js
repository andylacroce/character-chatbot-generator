/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizeCss: true,
  },
  // Avoid running ESLint during production builds to prevent circular-structure
  // Let Next.js run ESLint during builds so we can reproduce and fix the
  // circular-structure serialization issue. If necessary we will re-enable
  // ignoreDuringBuilds after fixing the root cause.
  serverExternalPackages: ['winston'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oaidalleapiprodscus.blob.core.windows.net',
        pathname: '/**',
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
