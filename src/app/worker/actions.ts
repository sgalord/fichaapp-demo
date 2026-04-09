'use server'

import { createAdminClient } from '@/lib/supabase/server'

export interface ObraInfo {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  radius: number
}

/**
 * Obtiene las obras asignadas al trabajador para hoy y mañana.
 * Usa createAdminClient() → bypass total de RLS.
 * El userId viene verificado desde el cliente (supabase.auth.getUser()).
 * Los Server Actions de Next.js están firmados — no son invocables desde fuera.
 */
export async function getWorkerObras(
  userId: string,
  today: string,
  tomorrow: string
): Promise<{ todayObra: ObraInfo | null; tomorrowObra: ObraInfo | null }> {
  if (!userId) return { todayObra: null, tomorrowObra: null }

  try {
    const admin = await createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any

    const [{ data: todayData }, { data: tomorrowData }] = await Promise.all([
      sb.from('obra_assignments')
        .select('obra:obras(id,name,address,latitude,longitude,radius)')
        .eq('worker_id', userId)
        .eq('date', today)
        .limit(1),
      sb.from('obra_assignments')
        .select('obra:obras(id,name,address,latitude,longitude,radius)')
        .eq('worker_id', userId)
        .eq('date', tomorrow)
        .limit(1),
    ])

    return {
      todayObra:    todayData?.[0]?.obra    ?? null,
      tomorrowObra: tomorrowData?.[0]?.obra ?? null,
    }
  } catch (err) {
    console.error('[getWorkerObras]', err)
    return { todayObra: null, tomorrowObra: null }
  }
}
