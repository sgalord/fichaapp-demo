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

  const body = await req.json()
  const { name, address, latitude, longitude, radius } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from('obras')
    .insert({
      name: name.trim(),
      address: address?.trim() || null,
      latitude: latitude || null,
      longitude: longitude || null,
      radius: radius ?? 200,
      active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Error al crear obra' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
