/**
 * Rate limiter en memoria con ventana deslizante.
 *
 * LIMITACIÓN EN PRODUCCIÓN: En Vercel (serverless) cada instancia tiene su propia
 * memoria — el límite no se comparte entre instancias paralelas. Un atacante con
 * múltiples IPs o que acierte varias instancias puede sortearlo.
 *
 * Para el volumen de esta app (empresa pequeña, ≤50 workers) es suficiente.
 * Si la app crece, migrar a Upstash Redis:
 *   https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
 *   Variables a añadir: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Limpieza lazy: purga entradas expiradas en cada llamada para evitar memory leaks
// sin usar setInterval (no recomendado en funciones serverless).
function purgeExpired(now: number) {
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key)
  }
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
}

/**
 * @param key       Clave única (ej: IP, username, IP+endpoint)
 * @param limit     Máximo de requests permitidos en la ventana
 * @param windowMs  Duración de la ventana en milisegundos
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  // Purgar entradas expiradas solo ocasionalmente para no iterar el map en cada request
  if (store.size > 500) purgeExpired(now)

  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}
