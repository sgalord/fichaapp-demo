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
  type:         z.enum(['vacation', 'personal_day', 'sick_leave', 'other']),
  date_from:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason:       z.string().max(500).optional().nullable(),
  document_url: z.string().url().optional().nullable(),
  // Solo admin
  worker_id:    z.string().uuid().optional(),
  pre_approved: z.boolean().optional(),   // si true → status='approved' directamente
  admin_note:   z.string().max(500).optional().nullable(),
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
  // overlap=true: devuelve ausencias que se solapan con el rango [date_from, date_to]
  // útil para asignaciones (detectar vacaciones en una semana)
  const overlap   = searchParams.get('overlap') === 'true'

  const admin = await createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = admin
    .from('absences')
    .select('*, worker:profiles!worker_id(id, full_name, avatar_url)')
    .order('created_at', { ascending: false })

  if (workerId) q = q.eq('worker_id', workerId)
  if (status)   q = q.eq('status', status)

  if (overlap && dateFrom && dateTo) {
    // Solapamiento: date_from <= dateTo AND date_to >= dateFrom
    q = q.lte('date_from', dateTo).gte('date_to', dateFrom)
  } else {
    if (dateFrom) q = q.gte('date_from', dateFrom)
    if (dateTo)   q = q.lte('date_to', dateTo)
  }

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
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const { type, date_from, date_to, reason, document_url, pre_approved, admin_note } = parsed.data

  const isAdmin = ['admin', 'superadmin'].includes(auth.role)
  const worker_id = isAdmin && parsed.data.worker_id ? parsed.data.worker_id : auth.user.id

  const adminClient = await createAdminClient()
  const { data: overlap } = await adminClient
    .from('absences')
    .select('id, date_from, date_to, status')
    .eq('worker_id', worker_id)
    .neq('status', 'rejected')
    .lte('date_from', date_to)
    .gte('date_to', date_from)

  if (overlap && overlap.length > 0) {
    return NextResponse.json({
      error: 'Ya existe una ausencia en ese rango de fechas',
      conflict: true,
    }, { status: 409 })
  }

  // Admin puede crear directamente aprobada
  const status = isAdmin && pre_approved ? 'approved' : 'pending'

  const { data, error } = await adminClient
    .from('absences')
    .insert({
      worker_id,
      type,
      date_from,
      date_to,
      reason:       reason      ?? null,
      document_url: document_url ?? null,
      admin_note:   isAdmin && admin_note ? admin_note : null,
      status,
      reviewed_by:  isAdmin && pre_approved ? auth.user.id  : null,
      reviewed_at:  isAdmin && pre_approved ? new Date().toISOString() : null,
    })
    .select('*, worker:profiles!worker_id(id, full_name, avatar_url)')
    .single()

  if (error) return NextResponse.json({ error: 'Error al crear ausencia' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
