import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) return null
  return user
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const body = await req.json()
  const { name, address, date, latitude, longitude, radius, assign_to, group_ids, worker_ids } = body

  const updates: Record<string, unknown> = {}
  if (name)      updates.name      = name
  if (address !== undefined) updates.address = address || null
  if (date)      updates.date      = date
  if (latitude)  updates.latitude  = parseFloat(latitude)
  if (longitude) updates.longitude = parseFloat(longitude)
  if (radius)    updates.radius    = parseInt(radius)

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('work_locations').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: 'Error al actualizar' }, { status: 500 })
  }

  if (assign_to) {
    await supabase.from('location_assignments').delete().eq('work_location_id', id)
    if (assign_to === 'all') {
      await supabase.from('location_assignments').insert({ work_location_id: id })
    } else if (assign_to === 'groups' && group_ids?.length) {
      await supabase.from('location_assignments').insert(
        group_ids.map((gid: string) => ({ work_location_id: id, group_id: gid }))
      )
    } else if (assign_to === 'workers' && worker_ids?.length) {
      await supabase.from('location_assignments').insert(
        worker_ids.map((wid: string) => ({ work_location_id: id, worker_id: wid }))
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
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const { error } = await supabase.from('work_locations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  return NextResponse.json({ success: true })
}
