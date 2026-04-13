/** @type {import('next').NextConfig} */
const path = require('path')
const { withSentryConfig } = require('@sentry/nextjs')

const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  images: {
    remotePatterns: [],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
  env: {
    NEXT_PUBLIC_VERCEL_TOOLBAR_ENABLED: '0',
  },
}

module.exports = withSentryConfig(nextConfig, {
  // Silencia el output de Sentry durante el build
  silent: true,

  // No subir source maps (requeriría SENTRY_AUTH_TOKEN)
  sourcemaps: {
    disable: true,
  },

  // No añadir el bundle de Sentry si el DSN no está configurado
  disableClientWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
  disableServerWebpackPlugin: !process.env.NEXT_PUBLIC_SENTRY_DSN,
})
