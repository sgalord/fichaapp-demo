import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

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

// Esquema para que el admin apruebe/rechace
const ReviewSchema = z.object({
  status:       z.enum(['approved', 'rejected']),
  review_notes: z.string().max(500).optional().nullable(),
})

// Esquema para que el trabajador actualice su solicitud pendiente
const WorkerUpdateSchema = z.object({
  type:         z.enum(['vacation', 'personal_day', 'sick_leave', 'other']).optional(),
  date_from:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason:       z.string().max(500).optional().nullable(),
  document_url: z.string().url().optional().nullable(),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const adminClient = await createAdminClient()
  const { data, error } = await adminClient
    .from('absences')
    .select('*, worker:profiles!worker_id(id, full_name, avatar_url)')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const isAdmin = ['admin', 'superadmin'].includes(auth.role)
  if (!isAdmin && data.worker_id !== auth.user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  return NextResponse.json({ data })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ['admin', 'superadmin'].includes(auth.role)
  const adminClient = await createAdminClient()

  // Obtener la ausencia actual
  const { data: absence, error: fetchErr } = await adminClient
    .from('absences')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !absence) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const body = await req.json()

  if (isAdmin) {
    // Admin: aprobar o rechazar
    const parsed = ReviewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
    }

    const { data, error } = await adminClient
      .from('absences')
      .update({
        status:       parsed.data.status,
        review_notes: parsed.data.review_notes ?? null,
        reviewed_by:  auth.user.id,
        reviewed_at:  new Date().toISOString(),
        updated_at:   new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, worker:profiles!worker_id(id, full_name, avatar_url)')
      .single()

    if (error) return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })

    await logAudit({
      admin_id:    auth.user.id,
      action:      parsed.data.status === 'approved' ? 'absence_approved' : 'absence_rejected',
      target_type: 'absence',
      target_id:   id,
      target_name: `${absence.type} ${absence.date_from}→${absence.date_to}`,
      details:     { review_notes: parsed.data.review_notes },
    })

    return NextResponse.json({ data })
  }

  // Trabajador: solo puede modificar sus propias ausencias PENDIENTES
  if (absence.worker_id !== auth.user.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }
  if (absence.status !== 'pending') {
    return NextResponse.json({ error: 'Solo se pueden modificar ausencias pendientes' }, { status: 400 })
  }

  const parsed = WorkerUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.type)         updates.type         = parsed.data.type
  if (parsed.data.date_from)    updates.date_from    = parsed.data.date_from
  if (parsed.data.date_to)      updates.date_to      = parsed.data.date_to
  if ('reason'       in parsed.data) updates.reason       = parsed.data.reason
  if ('document_url' in parsed.data) updates.document_url = parsed.data.document_url

  // Validar rango si cambian fechas
  const newFrom = (updates.date_from as string) ?? absence.date_from
  const newTo   = (updates.date_to   as string) ?? absence.date_to
  if (newTo < newFrom) {
    return NextResponse.json({ error: 'date_to debe ser igual o posterior a date_from' }, { status: 400 })
  }

  const { data, error } = await adminClient
    .from('absences')
    .update(updates)
    .eq('id', id)
    .select('*, worker:profiles!worker_id(id, full_name, avatar_url)')
    .single()

  if (error) return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ['admin', 'superadmin'].includes(auth.role)
  const adminClient = await createAdminClient()

  const { data: absence } = await adminClient
    .from('absences')
    .select('worker_id, status, type, date_from, date_to')
    .eq('id', id)
    .single()

  if (!absence) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Trabajadores solo borran las suyas y solo si están pendientes
  if (!isAdmin) {
    if (absence.worker_id !== auth.user.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    if (absence.status !== 'pending') {
      return NextResponse.json({ error: 'Solo se pueden cancelar ausencias pendientes' }, { status: 400 })
    }
  }

  const { error } = await adminClient.from('absences').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })

  if (isAdmin) {
    await logAudit({
      admin_id:    auth.user.id,
      action:      'absence_deleted',
      target_type: 'absence',
      target_id:   id,
      target_name: `${absence.type} ${absence.date_from}→${absence.date_to}`,
    })
  }

  return NextResponse.json({ ok: true })
}
