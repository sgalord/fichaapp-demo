import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const CreateObraSchema = z.object({
  name:      z.string().min(1).max(200).transform(s => s.trim()),
  address:   z.string().max(500).optional().nullable(),
  latitude:  z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  radius:    z.number().int().min(1).max(10000).optional().default(200),
})

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) return null
  return user
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('obras')
    .select('*')
    .order('name')

  if (error) return NextResponse.json({ error: 'Error al obtener obras' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const parsed = CreateObraSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { name, address, latitude, longitude, radius } = parsed.data

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from('obras')
    .insert({
      name,
      address: address?.trim() || null,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      radius,
      active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Error al crear obra' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
