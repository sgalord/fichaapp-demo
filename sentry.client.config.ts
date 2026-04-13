import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Captura el 10% de las trazas de rendimiento en producción
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Solo activar en producción para no llenar Sentry con errores de desarrollo
  enabled: process.env.NODE_ENV === 'production',

  // No enviar errores de red o de cancelación de requests
  ignoreErrors: [
    'AbortError',
    'NetworkError',
    /^Network request failed/,
    /^Failed to fetch/,
  ],
})
