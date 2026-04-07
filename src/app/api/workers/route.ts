import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: adminProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(adminProfile?.role ?? '')) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, active, avatar_url, username, created_at, updated_at')
    .in('role', ['worker', 'admin'])
    .eq('active', true)
    .order('full_name')

  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: adminProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (!['admin', 'superadmin'].includes(adminProfile?.role ?? '')) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const body = await req.json()
  const { full_name, email, password, phone, role, group_ids, username } = body

  if (!full_name || !email || !password) {
    return NextResponse.json({ error: 'Nombre, email y contraseña son obligatorios' }, { status: 400 })
  }

  if (password.length < 8) {
    return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
  }

  const admin = await createAdminClient()
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim(), role: role ?? 'worker' },
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      return NextResponse.json({ error: 'Este email ya está registrado' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 })
  }

  // Generate username from name if not provided
  const generatedUsername = username?.trim().toLowerCase() || (() => {
    const parts = full_name.trim().toLowerCase().split(/\s+/)
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0]
  })()

  await admin
    .from('profiles')
    .update({
      full_name: full_name.trim(),
      phone: phone || null,
      role: role ?? 'worker',
      username: generatedUsername,
    })
    .eq('id', authUser.user.id)

  if (group_ids?.length) {
    await admin.from('user_groups').insert(
      group_ids.map((gid: string) => ({ user_id: authUser.user.id, group_id: gid }))
    )
  }

  return NextResponse.json({ data: { id: authUser.user.id } }, { status: 201 })
}
