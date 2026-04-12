import { NextRequest, NextResponse } from 'next/server'
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

const DEFAULT_VACATION = 22
const DEFAULT_PERSONAL = 6

// GET /api/my-balance?year=2026
// Devuelve el saldo de vacaciones del trabajador autenticado
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const year = parseInt(new URL(req.url).searchParams.get('year') ?? String(new Date().getFullYear()))
  const adminClient = await createAdminClient()
  const workerId = auth.user.id

  const [allowanceRes, absenceRes] = await Promise.all([
    adminClient.from('absence_allowances')
      .select('vacation_days, personal_days')
      .eq('worker_id', workerId)
      .eq('year', year)
      .maybeSingle(),
    adminClient.from('absences')
      .select('type, date_from, date_to')
      .eq('worker_id', workerId)
      .eq('status', 'approved')
      .gte('date_from', `${year}-01-01`)
      .lte('date_to', `${year}-12-31`),
  ])

  function calcDays(from: string, to: string) {
    const [fy, fm, fd] = from.split('-').map(Number)
    const [ty, tm, td] = to.split('-').map(Number)
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000) + 1
  }

  const alloc = allowanceRes.data ?? { vacation_days: DEFAULT_VACATION, personal_days: DEFAULT_PERSONAL }
  const used = { vacation: 0, personal_day: 0, sick_leave: 0, other: 0 }

  for (const a of (absenceRes.data ?? [])) {
    const days = calcDays(a.date_from, a.date_to)
    if (a.type === 'vacation')     used.vacation    += days
    if (a.type === 'personal_day') used.personal_day += days
    if (a.type === 'sick_leave')   used.sick_leave  += days
    if (a.type === 'other')        used.other        += days
  }

  return NextResponse.json({
    data: {
      year,
      vacation_total:     alloc.vacation_days,
      vacation_used:      used.vacation,
      vacation_remaining: alloc.vacation_days - used.vacation,
      personal_total:     alloc.personal_days,
      personal_used:      used.personal_day,
      personal_remaining: alloc.personal_days - used.personal_day,
      sick_used:          used.sick_leave,
      other_used:         used.other,
    },
  })
}
