import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { haversineDistance } from '@/lib/utils'

const CheckinSchema = z.object({
  type:               z.enum(['in', 'out']),
  latitude:           z.number().min(-90).max(90).nullable().optional(),
  longitude:          z.number().min(-180).max(180).nullable().optional(),
  obra_id:            z.string().uuid().nullable().optional(),   // sistema nuevo
  work_location_id:   z.string().uuid().nullable().optional(),   // legacy
  photo_url:          z.string().url().nullable().optional(),
  device_fingerprint: z.string().max(64).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const parsed = CheckinSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { type, latitude, longitude, obra_id, work_location_id, photo_url, device_fingerprint } = parsed.data

  let distance_meters: number | null = null
  let within_radius = true

  // Sistema nuevo: calcular distancia desde obras
  if (obra_id && latitude != null && longitude != null) {
    const admin = await createAdminClient()
    const { data: obra } = await admin
      .from('obras')
      .select('latitude, longitude, radius')
      .eq('id', obra_id)
      .single()

    if (obra?.latitude != null && obra?.longitude != null) {
      distance_meters = haversineDistance(latitude, longitude, obra.latitude, obra.longitude)
      within_radius = distance_meters <= (obra.radius ?? 200)
    }
  }
  // Sistema legacy: calcular distancia desde work_locations
  else if (work_location_id && latitude != null && longitude != null) {
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
      worker_id:          user.id,
      work_location_id:   work_location_id ?? null,
      obra_id:            obra_id ?? null,
      type,
      latitude:           latitude ?? null,
      longitude:          longitude ?? null,
      distance_meters,
      within_radius,
      photo_url:          photo_url ?? null,
      device_fingerprint: device_fingerprint ?? null,
      timestamp:          new Date().toISOString(),
    })
    .select('id, type, timestamp, distance_meters, within_radius, photo_url, device_fingerprint, obra_id')
    .single()

  if (error) {
    console.error('Error inserting check-in:', error)
    return NextResponse.json({ error: 'Error al registrar fichaje' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
