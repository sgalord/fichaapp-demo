import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient, createClient } from '@/lib/supabase/server'

async function getAuthUser(req?: NextRequest) {
  const authHeader = req?.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const admin = await createAdminClient()
    const { data: { user } } = await admin.auth.getUser(token)
    if (user) {
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
      return { user, role: profile?.role ?? 'worker' }
    }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return { user, role: profile?.role ?? 'worker' }
}

const UpsertSchema = z.object({
  worker_id:     z.string().uuid(),
  year:          z.number().int().min(2020).max(2100),
  vacation_days: z.number().int().min(0).max(365),
  personal_days: z.number().int().min(0).max(365),
})

const DEFAULT_VACATION = 22
const DEFAULT_PERSONAL = 6

// GET /api/absence-allowances?year=2026
// Devuelve todos los trabajadores con su saldo del año (rellena con defaults si no hay registro)
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(auth.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const year = parseInt(new URL(req.url).searchParams.get('year') ?? String(new Date().getFullYear()))
  const adminClient = await createAdminClient()

  // Todos los trabajadores activos
  const { data: workers } = await adminClient
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('role', 'worker')
    .eq('active', true)
    .order('full_name')

  // Allowances registrados para el año
  const { data: allowances } = await adminClient
    .from('absence_allowances')
    .select('*')
    .eq('year', year)

  // Ausencias aprobadas del año (para calcular días consumidos)
  const { data: absences } = await adminClient
    .from('absences')
    .select('worker_id, type, date_from, date_to')
    .eq('status', 'approved')
    .gte('date_from', `${year}-01-01`)
    .lte('date_to',   `${year}-12-31`)

  function calcDays(from: string, to: string) {
    return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
  }

  // Construir mapa de consumidos por worker+tipo
  const usedMap: Record<string, { vacation: number; personal_day: number; sick_leave: number; other: number }> = {}
  for (const a of (absences ?? [])) {
    if (!usedMap[a.worker_id]) usedMap[a.worker_id] = { vacation: 0, personal_day: 0, sick_leave: 0, other: 0 }
    const days = calcDays(a.date_from, a.date_to)
    if (a.type === 'vacation')    usedMap[a.worker_id].vacation    += days
    if (a.type === 'personal_day') usedMap[a.worker_id].personal_day += days
    if (a.type === 'sick_leave')  usedMap[a.worker_id].sick_leave  += days
    if (a.type === 'other')       usedMap[a.worker_id].other       += days
  }

  const allowanceMap: Record<string, { vacation_days: number; personal_days: number }> = {}
  for (const a of (allowances ?? [])) {
    allowanceMap[a.worker_id] = { vacation_days: a.vacation_days, personal_days: a.personal_days }
  }

  const data = (workers ?? []).map(w => {
    const alloc  = allowanceMap[w.id] ?? { vacation_days: DEFAULT_VACATION, personal_days: DEFAULT_PERSONAL }
    const used   = usedMap[w.id]      ?? { vacation: 0, personal_day: 0, sick_leave: 0, other: 0 }
    return {
      worker_id:   w.id,
      worker:      w,
      year,
      vacation_total:     alloc.vacation_days,
      vacation_used:      used.vacation,
      vacation_remaining: alloc.vacation_days - used.vacation,
      personal_total:     alloc.personal_days,
      personal_used:      used.personal_day,
      personal_remaining: alloc.personal_days - used.personal_day,
      sick_used:          used.sick_leave,
      other_used:         used.other,
    }
  })

  return NextResponse.json({ data })
}

// PUT /api/absence-allowances  — upsert allowance para un worker/año
export async function PUT(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth || !['admin', 'superadmin'].includes(auth.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = UpsertSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const adminClient = await createAdminClient()
  const { data, error } = await adminClient
    .from('absence_allowances')
    .upsert({
      worker_id:     parsed.data.worker_id,
      year:          parsed.data.year,
      vacation_days: parsed.data.vacation_days,
      personal_days: parsed.data.personal_days,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'worker_id,year' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  return NextResponse.json({ data })
}
