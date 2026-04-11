import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const UpdateObraSchema = z.object({
  name:      z.string().min(1).max(200).transform(s => s.trim()).optional(),
  address:   z.string().max(500).optional().nullable(),
  latitude:  z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  radius:    z.number().int().min(1).max(10000).optional(),
  active:    z.boolean().optional(),
})

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) return null
  return user
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const parsed = UpdateObraSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }

  const admin = await createAdminClient()
  const updates: Record<string, unknown> = {}
  const d = parsed.data
  if (d.name      !== undefined) updates.name      = d.name
  if (d.address   !== undefined) updates.address   = d.address?.trim() || null
  if (d.latitude  !== undefined) updates.latitude  = d.latitude
  if (d.longitude !== undefined) updates.longitude = d.longitude
  if (d.radius    !== undefined) updates.radius    = d.radius
  if (d.active    !== undefined) updates.active    = d.active

  const { data, error } = await admin.from('obras').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Error al actualizar obra' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const admin = await createAdminClient()

  // Check no assignments exist
  const { count } = await admin
    .from('obra_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('obra_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'No se puede eliminar: tiene asignaciones activas' }, { status: 409 })
  }

  const { error } = await admin.from('obras').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Error al eliminar obra' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
