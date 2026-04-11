import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const CreateAssignmentSchema = z.object({
  obra_id:   z.string().uuid(),
  date:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date debe ser YYYY-MM-DD'),
  worker_id: z.string().uuid().optional().nullable(),
  group_id:  z.string().uuid().optional().nullable(),
}).refine(d => d.worker_id || d.group_id, {
  message: 'Se requiere worker_id o group_id',
})

async function getAuthUser(req?: NextRequest) {
  // Intentar autenticación por Bearer token (peticiones cliente con fetch)
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
  // Fallback: autenticación por cookie de sesión
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return { user, role: profile?.role ?? 'worker' }
}

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ['admin', 'superadmin'].includes(auth.role)
  const { searchParams } = new URL(req.url)
  const date     = searchParams.get('date')
  const dateFrom = searchParams.get('date_from')
  const dateTo   = searchParams.get('date_to')
  // Workers can only fetch their own assignments
  const workerId = isAdmin ? searchParams.get('worker_id') : auth.user.id
  const obraId   = searchParams.get('obra_id')

  const admin = await createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin
    .from('obra_assignments')
    .select('*, obra:obras(id,name,address,latitude,longitude,radius), worker:profiles(id,full_name,avatar_url)')

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
  const auth = await getAuthUser(req)
  if (!auth || !['admin', 'superadmin'].includes(auth.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const user = auth.user

  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === '1'

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const parsed = CreateAssignmentSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { obra_id, worker_id, group_id, date } = parsed.data

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
