'use server'

import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { todayISO, tomorrowISO } from '@/lib/utils'

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
 * Obtiene las obras asignadas al trabajador autenticado para hoy y mañana.
 * El userId se obtiene desde la sesión del servidor — nunca del cliente.
 */
export async function getWorkerObras(): Promise<{
  todayObra: ObraInfo | null
  tomorrowObra: ObraInfo | null
}> {
  // Obtener el usuario desde la sesión del servidor (no del cliente)
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { todayObra: null, tomorrowObra: null }

  const today    = todayISO()
  const tomorrow = tomorrowISO()
  const admin    = getAdminClient()

  const [
    { data: todayData,    error: e1 },
    { data: tomorrowData, error: e2 },
  ] = await Promise.all([
    admin
      .from('obra_assignments')
      .select('obra:obras(id,name,address,latitude,longitude,radius)')
      .eq('worker_id', user.id)
      .eq('date', today)
      .limit(1),
    admin
      .from('obra_assignments')
      .select('obra:obras(id,name,address,latitude,longitude,radius)')
      .eq('worker_id', user.id)
      .eq('date', tomorrow)
      .limit(1),
  ])

  if (e1) console.error('[getWorkerObras] today error:', e1.message)
  if (e2) console.error('[getWorkerObras] tomorrow error:', e2.message)

  return {
    todayObra:    (todayData as any)?.[0]?.obra    ?? null,
    tomorrowObra: (tomorrowData as any)?.[0]?.obra ?? null,
  }
}
