import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) return null
  return user
}

// GET — devuelve email del trabajador (requiere admin)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const admin = await createAdminClient()
  const { data: authUser, error } = await admin.auth.admin.getUserById(id)
  if (error || !authUser.user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  return NextResponse.json({ email: authUser.user.email ?? '' })
}

// PUT — actualiza perfil, email, contraseña y grupos
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const body = await req.json()
  const { full_name, email, phone, role, active, group_ids, password } = body

  const admin = await createAdminClient()

  // Actualizar perfil (tabla profiles)
  const profileUpdates: Record<string, unknown> = {}
  if (full_name !== undefined) profileUpdates.full_name = full_name
  if (phone     !== undefined) profileUpdates.phone     = phone || null
  if (role      !== undefined) profileUpdates.role      = role
  if (active    !== undefined) profileUpdates.active    = active

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await admin.from('profiles').update(profileUpdates).eq('id', id)
    if (error) return NextResponse.json({ error: 'Error al actualizar perfil' }, { status: 500 })
  }

  // Actualizar auth (email y/o contraseña)
  const authUpdates: Record<string, string> = {}
  if (email    && email.trim())         authUpdates.email    = email.trim().toLowerCase()
  if (password && password.length >= 8) authUpdates.password = password

  if (Object.keys(authUpdates).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(id, authUpdates)
    if (error) return NextResponse.json({ error: 'Error al actualizar credenciales' }, { status: 500 })
  }

  // Actualizar grupos
  if (group_ids !== undefined) {
    await admin.from('user_groups').delete().eq('user_id', id)
    if (group_ids.length > 0) {
      await admin.from('user_groups').insert(
        group_ids.map((gid: string) => ({ user_id: id, group_id: gid }))
      )
    }
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'superadmin') {
    return NextResponse.json({ error: 'Solo el superadmin puede eliminar usuarios' }, { status: 403 })
  }

  const admin = await createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: 'Error al eliminar usuario' }, { status: 500 })

  return NextResponse.json({ success: true })
}
