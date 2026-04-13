import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/audit'
import { haversineDistance } from '@/lib/utils'

const CreateCheckinSchema = z.object({
  worker_id:   z.string().uuid(),
  type:        z.enum(['in', 'out']),
  timestamp:   z.string().datetime({ offset: true }),
  obra_id:     z.string().uuid().nullable().optional(),
  latitude:    z.number().min(-90).max(90).nullable().optional(),
  longitude:   z.number().min(-180).max(180).nullable().optional(),
  notes:       z.string().max(500).nullable().optional(),
  // Admin puede forzar within_radius manualmente
  within_radius_override: z.boolean().nullable().optional(),
})

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(profile?.role ?? '')) return null
  return user
}

// POST /api/checkins — Admin crea un fichaje manual para cualquier empleado
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const adminUser = await requireAdmin(supabase)
  if (!adminUser) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const parsed = CreateCheckinSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Datos inválidos'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const { worker_id, type, timestamp, obra_id, latitude, longitude, notes, within_radius_override } = parsed.data

  // Verificar que el worker existe y es activo
  const admin = await createAdminClient()
  const { data: worker } = await admin
    .from('profiles')
    .select('id, full_name, active')
    .eq('id', worker_id)
    .single()

  if (!worker || !worker.active) {
    return NextResponse.json({ error: 'Trabajador no encontrado o inactivo' }, { status: 404 })
  }

  // Calcular distancia si hay obra y coordenadas
  let distance_meters: number | null = null
  let within_radius = within_radius_override ?? true

  if (obra_id && latitude != null && longitude != null) {
    const { data: obra } = await admin
      .from('obras')
      .select('latitude, longitude, radius')
      .eq('id', obra_id)
      .single()

    if (obra?.latitude != null && obra?.longitude != null) {
      distance_meters = haversineDistance(latitude, longitude, obra.latitude, obra.longitude)
      // Solo sobreescribir si el admin no forzó manualmente
      if (within_radius_override == null) {
        within_radius = distance_meters <= (obra.radius ?? 200)
      }
    }
  }

  const { data, error } = await admin
    .from('check_ins')
    .insert({
      worker_id,
      obra_id:           obra_id ?? null,
      type,
      timestamp:         new Date(timestamp).toISOString(),
      latitude:          latitude ?? null,
      longitude:         longitude ?? null,
      distance_meters,
      within_radius,
      notes:             notes ?? null,
      manually_modified: true,
      modified_by:       adminUser.id,
      modified_at:       new Date().toISOString(),
    })
    .select('id, type, timestamp, within_radius, obra_id')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Error al crear fichaje' }, { status: 500 })
  }

  await logAudit({
    adminId:    adminUser.id,
    action:     'edit_checkin',
    targetType: 'checkin',
    targetId:   data.id,
    targetName: `Fichaje manual — ${worker.full_name}`,
    details:    { worker_id, type, timestamp, obra_id },
  })

  return NextResponse.json({ data }, { status: 201 })
}
