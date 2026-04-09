'use server'

import { createClient, createAdminClient } from '@/lib/supabase/server'

export interface ObraInfo {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  radius: number
}

export async function getWorkerObras(today: string, tomorrow: string): Promise<{
  todayObra: ObraInfo | null
  tomorrowObra: ObraInfo | null
  workerId: string | null
  error?: string
}> {
  try {
    // Leer sesión del trabajador desde cookies del servidor
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { todayObra: null, tomorrowObra: null, workerId: null, error: 'no_user' }

    // Usar admin client para bypassear RLS por completo
    const admin = await createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = admin as any

    const [{ data: todayData, error: e1 }, { data: tomorrowData, error: e2 }] = await Promise.all([
      sb.from('obra_assignments')
        .select('obra:obras(id,name,address,latitude,longitude,radius)')
        .eq('worker_id', user.id)
        .eq('date', today)
        .limit(1),
      sb.from('obra_assignments')
        .select('obra:obras(id,name,address,latitude,longitude,radius)')
        .eq('worker_id', user.id)
        .eq('date', tomorrow)
        .limit(1),
    ])

    if (e1) console.error('[getWorkerObras] today error:', e1)
    if (e2) console.error('[getWorkerObras] tomorrow error:', e2)

    return {
      todayObra:    todayData?.[0]?.obra    ?? null,
      tomorrowObra: tomorrowData?.[0]?.obra ?? null,
      workerId:     user.id,
    }
  } catch (err) {
    console.error('[getWorkerObras] exception:', err)
    return { todayObra: null, tomorrowObra: null, workerId: null, error: String(err) }
  }
}
