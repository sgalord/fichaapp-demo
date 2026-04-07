import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) return null
  return user
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date     = searchParams.get('date')
  const dateFrom = searchParams.get('date_from')
  const dateTo   = searchParams.get('date_to')
  const workerId = searchParams.get('worker_id')
  const obraId   = searchParams.get('obra_id')

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase
    .from('obra_assignments')
    .select('*, obra:obras(id,name,address), worker:profiles(id,full_name,avatar_url)')

  if (date)     q = q.eq('date', date)
  if (dateFrom) q = q.gte('date', dateFrom)
  if (dateTo)   q = q.lte('date', dateTo)
  if (workerId) q = q.eq('worker_id', workerId)
  if (obraId)   q = q.eq('obra_id', obraId)

  q = q.order('date').order('obra_id')

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Error al obtener asignaciones' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === '1'

  const body = await req.json()
  const { obra_id, worker_id, group_id, date } = body

  if (!obra_id || !date) {
    return NextResponse.json({ error: 'obra_id y date son obligatorios' }, { status: 400 })
  }
  if (!worker_id && !group_id) {
    return NextResponse.json({ error: 'Se requiere worker_id o group_id' }, { status: 400 })
  }

  const admin = await createAdminClient()

  // Check conflict: same worker already assigned to another obra same day (only for workers, not forced)
  if (worker_id && !force) {
    const { data: existing } = await admin
      .from('obra_assignments')
      .select('id, obra:obras(name)')
      .eq('worker_id', worker_id)
      .eq('date', date)
      .neq('obra_id', obra_id)

    if (existing && existing.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const obraNames = existing.map((a: any) => (a.obra as any)?.name ?? 'otra obra').join(', ')
      return NextResponse.json({
        error: `El trabajador ya está asignado a: ${obraNames} el ${date}`,
        conflict: true,
        existing,
      }, { status: 409 })
    }
  }

  // Avoid duplicate exact assignment
  const matchField = worker_id ? 'worker_id' : 'group_id'
  const matchValue = worker_id ?? group_id
  const { data: dup } = await admin
    .from('obra_assignments')
    .select('id')
    .eq('obra_id', obra_id)
    .eq('date', date)
    .eq(matchField, matchValue)
    .maybeSingle()

  if (dup) {
    return NextResponse.json({ error: 'Esta asignación ya existe' }, { status: 409 })
  }

  const { data, error } = await admin
    .from('obra_assignments')
    .insert({ obra_id, worker_id: worker_id || null, group_id: group_id || null, date })
    .select('*, obra:obras(id,name,address), worker:profiles(id,full_name)')
    .single()

  if (error) return NextResponse.json({ error: 'Error al crear asignación' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
