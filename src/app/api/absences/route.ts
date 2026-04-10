import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'

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

const CreateSchema = z.object({
  type:      z.enum(['vacation', 'personal_day', 'sick_leave', 'other']),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason:    z.string().max(500).optional().nullable(),
  document_url: z.string().url().optional().nullable(),
}).refine(d => d.date_to >= d.date_from, {
  message: 'date_to debe ser igual o posterior a date_from',
})

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ['admin', 'superadmin'].includes(auth.role)
  const { searchParams } = new URL(req.url)

  const workerId  = isAdmin ? searchParams.get('worker_id') : auth.user.id
  const status    = searchParams.get('status')
  const dateFrom  = searchParams.get('date_from')
  const dateTo    = searchParams.get('date_to')

  const admin = await createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin
    .from('absences')
    .select('*, worker:profiles!worker_id(id, full_name, avatar_url)')
    .order('created_at', { ascending: false })

  if (workerId) q = q.eq('worker_id', workerId)
  if (status)   q = q.eq('status', status)
  if (dateFrom) q = q.gte('date_from', dateFrom)
  if (dateTo)   q = q.lte('date_to', dateTo)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Error al obtener ausencias' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { type, date_from, date_to, reason, document_url } = parsed.data

  // Quien crea la ausencia: el propio trabajador o un admin
  const isAdmin = ['admin', 'superadmin'].includes(auth.role)
  const worker_id = isAdmin && body.worker_id ? body.worker_id : auth.user.id

  // Comprobar solapamiento con ausencias ya existentes del mismo trabajador
  const adminClient = await createAdminClient()
  const { data: overlap } = await adminClient
    .from('absences')
    .select('id, date_from, date_to, status')
    .eq('worker_id', worker_id)
    .neq('status', 'rejected')
    .or(`date_from.lte.${date_to},date_to.gte.${date_from}`)

  if (overlap && overlap.length > 0) {
    return NextResponse.json({
      error: 'Ya existe una ausencia en ese rango de fechas',
      conflict: true,
    }, { status: 409 })
  }

  const { data, error } = await adminClient
    .from('absences')
    .insert({
      worker_id,
      type,
      date_from,
      date_to,
      reason:       reason ?? null,
      document_url: document_url ?? null,
      status: 'pending',
    })
    .select('*, worker:profiles!worker_id(id, full_name, avatar_url)')
    .single()

  if (error) return NextResponse.json({ error: 'Error al crear ausencia' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
