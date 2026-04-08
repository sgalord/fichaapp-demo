import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

const EditCheckinSchema = z.object({
  timestamp: z.string().datetime({ offset: true }).optional(),
  notes:     z.string().max(500).optional().nullable(),
  type:      z.enum(['in', 'out']).optional(),
})

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) return null
  return user
}

// PUT /api/checkins/[id] — Editar fichaje (solo admin)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const parsed = EditCheckinSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { timestamp, notes, type } = parsed.data

  const updates: Record<string, unknown> = {
    manually_modified: true,
    modified_by:  user.id,
    modified_at:  new Date().toISOString(),
  }
  if (timestamp) updates.timestamp = new Date(timestamp).toISOString()
  if (notes !== undefined) updates.notes = notes || null
  if (type)  updates.type = type

  const adminClient = await createAdminClient()
  const { error } = await adminClient.from('check_ins').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: 'Error al actualizar fichaje' }, { status: 500 })

  await logAudit({
    adminId: user.id,
    action: 'edit_checkin',
    targetType: 'checkin',
    targetId: id,
    details: { timestamp, notes, type },
  })

  return NextResponse.json({ success: true })
}

// DELETE /api/checkins/[id] — solo superadmin
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const adminClient = await createAdminClient()
  const { error } = await adminClient.from('check_ins').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })

  await logAudit({
    adminId: user.id,
    action: 'delete_checkin',
    targetType: 'checkin',
    targetId: id,
  })

  return NextResponse.json({ success: true })
}
