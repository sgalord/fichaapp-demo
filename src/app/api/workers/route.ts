import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'

const CreateWorkerSchema = z.object({
  full_name: z.string().min(2, 'Nombre demasiado corto').max(100),
  email:     z.string().email('Email inválido'),
  password:  z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  phone:     z.string().max(20).optional().nullable(),
  role:      z.enum(['worker', 'admin']).default('worker'),
  group_ids: z.array(z.string().uuid()).optional().default([]),
  username:  z.string().max(60).optional().nullable(),
})

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) return null
  return user
}

export async function GET() {
  const supabase = await createClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

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
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const parsed = CreateWorkerSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { full_name, email, password, phone, role, group_ids, username } = parsed.data

  const admin = await createAdminClient()
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name.trim(), role },
  })

  if (authError) {
    if (authError.message.includes('already registered')) {
      return NextResponse.json({ error: 'Este email ya está registrado' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Error al crear usuario' }, { status: 500 })
  }

  const generatedUsername = username?.trim().toLowerCase() || (() => {
    const parts = full_name.trim().toLowerCase().split(/\s+/)
    return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0]
  })()

  await admin.from('profiles').update({
    full_name: full_name.trim(),
    phone: phone || null,
    role,
    username: generatedUsername,
  }).eq('id', authUser.user.id)

  if (group_ids.length > 0) {
    await admin.from('user_groups').insert(
      group_ids.map((gid) => ({ user_id: authUser.user.id, group_id: gid }))
    )
  }

  await logAudit({
    adminId: user.id,
    action: 'create_worker',
    targetType: 'worker',
    targetId: authUser.user.id,
    targetName: full_name.trim(),
    details: { email: email.trim().toLowerCase(), role },
  })

  return NextResponse.json({ data: { id: authUser.user.id } }, { status: 201 })
}
