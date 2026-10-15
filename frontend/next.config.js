// ─── Cabeceras de seguridad ──────────────────────────────────────────────────
// El token de acceso vive en localStorage: si alguien logra inyectar código en
// una página (XSS), la CSP es lo que le impide cargar scripts de fuera o mandar
// los datos a otro servidor. Sin nonce (ver la guía de Next 16, «Without
// Nonces»): con nonce todas las páginas pasarían a generarse en cada visita.
//
// Por defecto la CSP va en modo «solo reportar» (Content-Security-Policy-
// Report-Only): avisa en la consola sin bloquear. Cuando una revisión completa
// no muestre violaciones, se compila con CSP_ENFORCE=true para activarla.
const isDev = process.env.NODE_ENV !== 'production';
const cspActiva = process.env.CSP_ENFORCE === 'true';

function origen(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

// NEXT_PUBLIC_API_URL se hornea al compilar (Dockerfile.prod), igual que aquí.
const api = origen(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api');
// Archivos subidos: S3 en producción (los mismos hosts que images.remotePatterns)
// y el API en desarrollo (/uploads). Si se cambia a un CDN, agregarlo aquí.
const archivos = `${api} https://*.amazonaws.com`;

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  // Google Fonts: la vista previa de tipografías del Brief las carga al vuelo.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  `img-src 'self' data: blob: ${archivos} https://img.youtube.com`,
  `media-src 'self' blob: ${archivos}`,
  `connect-src 'self' ${api} https://*.ingest.sentry.io https://*.ingest.us.sentry.io${isDev ? ' ws: http://localhost:*' : ''}`,
  // Mapa y videos que los expertos de Net0 incrustan en su ficha.
  'frame-src https://www.google.com https://maps.google.com https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com',
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self' ${api}`,
  "frame-ancestors 'none'",
  // En modo «solo reportar» el navegador ignora esta directiva y lo avisa.
  ...(cspActiva && !isDev ? ['upgrade-insecure-requests'] : []),
].join('; ');

const cabecerasSeguridad = [
  { key: cspActiva ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', value: csp },
  // frame-ancestors no se aplica en modo «solo reportar»: esto sí impide que
  // otra web meta la app en un iframe para engañar al usuario (clickjacking).
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Micrófono y cámara: grabaciones de Ventas; ubicación: ficha de Net0.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), browsing-topics=()' },
  // Solo en producción (HTTPS). Sin includeSubDomains: no obliga a HTTPS a
  // otros subdominios del dueño que no sean de la app.
  ...(isDev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000' }]),
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: cabecerasSeguridad }];
  },
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