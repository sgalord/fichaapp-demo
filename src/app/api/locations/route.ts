import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const body = await req.json()
  const { name, address, date, latitude, longitude, radius, assign_to, group_ids, worker_ids } = body

  if (!name || !date || !latitude || !longitude) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }

  const lat = parseFloat(latitude)
  const lng = parseFloat(longitude)
  const rad = parseInt(radius) || 100

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Coordenadas inválidas' }, { status: 400 })
  }

  const { data: loc, error: locError } = await supabase
    .from('work_locations')
    .insert({
      name, address: address || null, date, latitude: lat, longitude: lng,
      radius: rad, created_by: user.id,
    })
    .select('id')
    .single()

  if (locError) return NextResponse.json({ error: 'Error al crear ubicación' }, { status: 500 })

  await createAssignments(supabase, loc.id, assign_to, group_ids, worker_ids)

  return NextResponse.json({ data: loc }, { status: 201 })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createAssignments(supabase: any, locId: string, assign_to: string, group_ids: string[], worker_ids: string[]) {
  if (assign_to === 'all') {
    await supabase.from('location_assignments').insert({ work_location_id: locId })
  } else if (assign_to === 'groups' && group_ids?.length) {
    await supabase.from('location_assignments').insert(
      group_ids.map((gid: string) => ({ work_location_id: locId, group_id: gid }))
    )
  } else if (assign_to === 'workers' && worker_ids?.length) {
    await supabase.from('location_assignments').insert(
      worker_ids.map((wid: string) => ({ work_location_id: locId, worker_id: wid }))
    )
  }
}
