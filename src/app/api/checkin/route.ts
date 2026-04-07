import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { haversineDistance } from '@/lib/utils'

export async function POST(req: NextRequest) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const { type, latitude, longitude, work_location_id } = body as {
    type: 'in' | 'out'
    latitude: number
    longitude: number
    work_location_id: string | null
  }

  if (!['in', 'out'].includes(type)) {
    return NextResponse.json({ error: 'Tipo de fichaje inválido' }, { status: 400 })
  }

  let distance_meters: number | null = null
  let within_radius = true

  if (work_location_id && latitude && longitude) {
    const { data: loc } = await supabase
      .from('work_locations')
      .select('latitude, longitude, radius')
      .eq('id', work_location_id)
      .single()

    if (loc) {
      distance_meters = haversineDistance(latitude, longitude, loc.latitude, loc.longitude)
      within_radius = distance_meters <= loc.radius
    }
  }

  const { data, error } = await supabase
    .from('check_ins')
    .insert({
      worker_id: user.id,
      work_location_id: work_location_id ?? null,
      type,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      distance_meters,
      within_radius,
      timestamp: new Date().toISOString(),
    })
    .select('id, type, timestamp, distance_meters, within_radius')
    .single()

  if (error) {
    console.error('Error inserting check-in:', error)
    return NextResponse.json({ error: 'Error al registrar fichaje' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
