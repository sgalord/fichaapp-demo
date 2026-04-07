import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// PUT /api/checkins/[id] — Editar fichaje (solo admin)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const body = await req.json()
  const { timestamp, notes, type } = body as {
    timestamp?: string
    notes?: string
    type?: 'in' | 'out'
  }

  const updates: Record<string, unknown> = {
    manually_modified: true,
    modified_by: user.id,
    modified_at: new Date().toISOString(),
  }

  if (timestamp) updates.timestamp = new Date(timestamp).toISOString()
  if (notes !== undefined) updates.notes = notes || null
  if (type) updates.type = type

  const adminClient = await createAdminClient()
  const { error } = await adminClient
    .from('check_ins')
    .update(updates)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Error al actualizar fichaje' }, { status: 500 })
  }

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const adminClient = await createAdminClient()
  const { error } = await adminClient
    .from('check_ins')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  return NextResponse.json({ success: true })
}
