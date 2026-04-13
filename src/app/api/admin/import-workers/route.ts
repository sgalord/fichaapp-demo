import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { randomBytes } from 'crypto'

const WorkerRowSchema = z.object({
  full_name: z.string().min(2).max(100),
  phone:     z.string().max(20).nullable().optional(),
})

const ObraRowSchema = z.object({
  name:    z.string().min(1).max(150),
  address: z.string().max(255).nullable().optional(),
})

const ImportSchema = z.object({
  workers:     z.array(WorkerRowSchema).min(1).max(200),
  obras:       z.array(ObraRowSchema).max(100).optional().default([]),
  email_domain: z.string().max(100).default('built.work'),
})

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) return null
  return user
}

function toUsername(full_name: string): string {
  const normalized = full_name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
  const parts = normalized.split(/\s+/)
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0]
}

function randomPassword(): string {
  return randomBytes(12).toString('base64').slice(0, 16)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const adminUser = await requireAdmin(supabase)
  if (!adminUser) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const parsed = ImportSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { workers, obras, email_domain } = parsed.data
  const admin = await createAdminClient()

  const results: {
    full_name: string
    email: string
    username: string
    password: string
    status: 'created' | 'skipped'
    error?: string
  }[] = []

  // ── Crear trabajadores ──────────────────────────────────────────────────
  for (const w of workers) {
    const username = toUsername(w.full_name)
    const email    = `${username}@${email_domain}`
    const password = randomPassword()

    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: w.full_name.trim(), role: 'worker' },
    })

    if (authError) {
      const skipped = authError.message.toLowerCase().includes('already registered')
      results.push({
        full_name: w.full_name,
        email,
        username,
        password: '',
        status: 'skipped',
        error: skipped ? 'Email ya existe' : authError.message,
      })
      continue
    }

    await admin.from('profiles').update({
      full_name: w.full_name.trim(),
      phone:     w.phone ?? null,
      role:      'worker',
      username,
    }).eq('id', authUser.user.id)

    results.push({ full_name: w.full_name, email, username, password, status: 'created' })
  }

  // ── Crear obras (skip duplicados por nombre) ────────────────────────────
  const obraResults: { name: string; status: 'created' | 'skipped' }[] = []

  for (const o of obras) {
    const { data: existing } = await admin
      .from('obras')
      .select('id')
      .ilike('name', o.name.trim())
      .limit(1)
      .maybeSingle()

    if (existing) {
      obraResults.push({ name: o.name, status: 'skipped' })
      continue
    }

    const { error: obraError } = await admin.from('obras').insert({
      name:    o.name.trim(),
      address: o.address?.trim() ?? null,
      radius:  200,
      active:  true,
    })

    obraResults.push({ name: o.name, status: obraError ? 'skipped' : 'created' })
  }

  await logAudit({
    adminId:    adminUser.id,
    action:     'create_worker',
    targetType: 'worker',
    targetId:   adminUser.id,
    targetName: `Importación masiva (${results.filter(r => r.status === 'created').length} trabajadores)`,
    details:    { created: results.filter(r => r.status === 'created').length, skipped: results.filter(r => r.status === 'skipped').length },
  })

  return NextResponse.json({ data: { workers: results, obras: obraResults } }, { status: 201 })
}
