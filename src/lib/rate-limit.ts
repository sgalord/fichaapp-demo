/**
 * Rate limiter en memoria con ventana deslizante.
 *
 * NOTA PARA PRODUCCIÓN: En Vercel (serverless) cada instancia tiene su propia
 * memoria, por lo que este limiter no es compartido entre instancias paralelas.
 * Para una protección robusta en producción usa Upstash Redis:
 * https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
 *
 * Para el volumen de esta app (pequeña empresa, ≤50 workers) es suficiente.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Limpia entradas expiradas cada 5 minutos para evitar memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) store.delete(key)
  }
}, 5 * 60 * 1000)

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
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    // Ventana nueva
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: limit - 1, resetAt: now + windowMs }
  }

  if (entry.count >= limit) {
    return { success: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  return { success: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}
