'use server'

import { createClient } from '@supabase/supabase-js'

export interface ObraInfo {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  radius: number
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * Obtiene las obras asignadas al trabajador para hoy y mañana.
 * Usa @supabase/supabase-js con service role → bypass total de RLS.
 * El userId viene verificado desde el cliente (supabase.auth.getUser()).
 */
export async function getWorkerObras(
  userId: string,
  today: string,
  tomorrow: string
): Promise<{ todayObra: ObraInfo | null; tomorrowObra: ObraInfo | null }> {
  if (!userId) return { todayObra: null, tomorrowObra: null }

  const admin = getAdminClient()

  const [
    { data: todayData, error: e1 },
    { data: tomorrowData, error: e2 },
  ] = await Promise.all([
    admin
      .from('obra_assignments')
      .select('obra:obras(id,name,address,latitude,longitude,radius)')
      .eq('worker_id', userId)
      .eq('date', today)
      .limit(1),
    admin
      .from('obra_assignments')
      .select('obra:obras(id,name,address,latitude,longitude,radius)')
      .eq('worker_id', userId)
      .eq('date', tomorrow)
      .limit(1),
  ])

  if (e1) console.error('[getWorkerObras] today error:', e1)
  if (e2) console.error('[getWorkerObras] tomorrow error:', e2)

  console.log('[getWorkerObras] userId:', userId, 'today:', today, 'tomorrow:', tomorrow)
  console.log('[getWorkerObras] todayData:', JSON.stringify(todayData))
  console.log('[getWorkerObras] tomorrowData:', JSON.stringify(tomorrowData))

  return {
    todayObra:    (todayData as any)?.[0]?.obra    ?? null,
    tomorrowObra: (tomorrowData as any)?.[0]?.obra ?? null,
  }
}
