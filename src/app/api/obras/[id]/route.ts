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

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const admin = await createAdminClient()

  const updates: Record<string, unknown> = {}
  if (body.name !== undefined)      updates.name      = body.name?.trim()
  if (body.address !== undefined)   updates.address   = body.address?.trim() || null
  if (body.latitude !== undefined)  updates.latitude  = body.latitude
  if (body.longitude !== undefined) updates.longitude = body.longitude
  if (body.radius !== undefined)    updates.radius    = body.radius
  if (body.active !== undefined)    updates.active    = body.active

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
