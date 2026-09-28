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
        source: '/network',
        destination: '/dashboard/net0',
        permanent: false,
      },
      {
        source: '/network/:path*',
        destination: '/dashboard/net0/:path*',
        permanent: false,
      },
      {
        source: '/net0',
        destination: '/dashboard/net0',
        permanent: false,
      },
      {
        source: '/net0/:path*',
        destination: '/dashboard/net0/:path*',
        permanent: false,
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