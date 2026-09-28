/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.amazonaws.com',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/dashboard/net0',
        destination: '/net0',
        permanent: true,
      },
      {
        source: '/dashboard/net0/:path*',
        destination: '/net0/:path*',
        permanent: true,
      },
      {
        source: '/network',
        destination: '/net0',
        permanent: true,
      },
      {
        source: '/network/:path*',
        destination: '/net0/:path*',
        permanent: true,
      },
    ];
  },
};

// Wrap with Sentry only when DSN is configured (graceful degradation)
if (process.env.SENTRY_DSN) {
  const { withSentryConfig } = require('@sentry/nextjs');
  module.exports = withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    silent: true,
    widenClientFileUpload: true,
    hideSourceMaps: true,
    disableLogger: true,
    automaticVercelMonitors: false,
  });
} else {
  module.exports = nextConfig;
}