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
};

export default nextConfig;
