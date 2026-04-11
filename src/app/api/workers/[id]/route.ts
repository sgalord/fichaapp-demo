import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

const UpdateWorkerSchema = z.object({
  full_name: z.string().min(2).max(100).optional(),
  email:     z.string().email().optional(),
  phone:     z.string().max(20).nullable().optional(),
  role:      z.enum(['worker', 'admin', 'superadmin']).optional(),
  active:    z.boolean().optional(),
  username:  z.string().max(60).nullable().optional(),
  password:  z.string().min(8).max(128).optional().or(z.literal('')),
  group_ids: z.array(z.string().uuid()).optional(),
})

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) return null
  return { user, role: profile!.role as string }
}

// GET — devuelve email del trabajador (requiere admin)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const auth = await requireAdmin(supabase)
  if (!auth) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  const { user } = auth

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
  const auth = await requireAdmin(supabase)
  if (!auth) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  const { user, role: callerRole } = auth

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const parsed = UpdateWorkerSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { full_name, email, phone, role, active, group_ids, password, username } = parsed.data

  // Solo superadmin puede asignar el rol superadmin
  if (role === 'superadmin' && callerRole !== 'superadmin') {
    return NextResponse.json({ error: 'Solo un superadmin puede asignar ese rol' }, { status: 403 })
  }
  const admin = await createAdminClient()

  // Obtener nombre actual para el log
  const { data: currentProfile } = await admin
    .from('profiles').select('full_name, active').eq('id', id).single()

  // Actualizar perfil
  const profileUpdates: Record<string, unknown> = {}
  if (full_name !== undefined) profileUpdates.full_name = full_name
  if (phone     !== undefined) profileUpdates.phone     = phone || null
  if (role      !== undefined) profileUpdates.role      = role
  if (active    !== undefined) profileUpdates.active    = active
  if (username  !== undefined) profileUpdates.username  = username?.trim().toLowerCase() || null

  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await admin.from('profiles').update(profileUpdates).eq('id', id)
    if (error) return NextResponse.json({ error: 'Error al actualizar perfil' }, { status: 500 })
  }

  // Actualizar auth (email y/o contraseña)
  const authUpdates: Record<string, string> = {}
  if (email    && email.trim())  authUpdates.email    = email.trim().toLowerCase()
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
        group_ids.map((gid) => ({ user_id: id, group_id: gid }))
      )
    }
  }

  // Determinar acción de audit
  const auditAction = active !== undefined && active !== currentProfile?.active
    ? 'toggle_worker_active'
    : 'update_worker'

  await logAudit({
    adminId: user.id,
    action: auditAction,
    targetType: 'worker',
    targetId: id,
    targetName: (full_name ?? currentProfile?.full_name) as string | undefined,
    details: {
      ...(active    !== undefined && { active }),
      ...(role      !== undefined && { role }),
      ...(email     !== undefined && { email }),
      ...(password  !== undefined && { passwordChanged: true }),
    },
  })

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

  // Obtener nombre antes de borrar para el log
  const admin = await createAdminClient()
  const { data: targetProfile } = await admin
    .from('profiles').select('full_name').eq('id', id).single()

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: 'Error al eliminar usuario' }, { status: 500 })

  await logAudit({
    adminId: user.id,
    action: 'delete_worker',
    targetType: 'worker',
    targetId: id,
    targetName: targetProfile?.full_name ?? undefined,
  })

  return NextResponse.json({ success: true })
}
