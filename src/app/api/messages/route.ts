import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient, createClient } from '@/lib/supabase/server'

async function getAuthUser(req?: NextRequest) {
  const authHeader = req?.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const admin = await createAdminClient()
    const { data: { user } } = await admin.auth.getUser(token)
    if (user) {
      const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
      return { user, role: profile?.role ?? 'worker' }
    }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return { user, role: profile?.role ?? 'worker' }
}

const SendSchema = z.object({
  body:      z.string().min(1).max(2000).transform(s => s.trim()),
  worker_id: z.string().uuid().optional(), // requerido solo cuando el admin envía
})

// GET /api/messages
// Trabajador: obtiene su propia conversación
// Admin: requiere ?worker_id=UUID para ver la conversación de un trabajador
//        sin worker_id → devuelve lista de conversaciones (último mensaje por trabajador)
export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ['admin', 'superadmin'].includes(auth.role)
  const { searchParams } = new URL(req.url)
  const adminClient = await createAdminClient()

  if (!isAdmin) {
    // Trabajador: marca como leídos los mensajes del admin hacia él, luego devuelve conversación
    await adminClient
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('worker_id', auth.user.id)
      .eq('is_from_admin', true)
      .is('read_at', null)

    const { data, error } = await adminClient
      .from('messages')
      .select('*')
      .eq('worker_id', auth.user.id)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: 'Error al obtener mensajes' }, { status: 500 })
    return NextResponse.json({ data })
  }

  // Admin con worker_id: ver conversación específica
  const workerId = searchParams.get('worker_id')
  if (workerId) {
    // Marcar mensajes del trabajador como leídos por el admin
    await adminClient
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('worker_id', workerId)
      .eq('is_from_admin', false)
      .is('read_at', null)

    const { data, error } = await adminClient
      .from('messages')
      .select('*')
      .eq('worker_id', workerId)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: 'Error al obtener mensajes' }, { status: 500 })
    return NextResponse.json({ data })
  }

  // Admin sin worker_id: lista de conversaciones con último mensaje + no leídos
  const { data: allMessages, error } = await adminClient
    .from('messages')
    .select('*, worker:profiles!worker_id(id, full_name, avatar_url)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Error al obtener conversaciones' }, { status: 500 })

  // Agrupar por worker_id — último mensaje + contador de no leídos del trabajador
  const convMap = new Map<string, {
    worker_id: string
    worker: { id: string; full_name: string; avatar_url: string | null }
    last_message: string
    last_at: string
    unread_count: number
    is_from_admin: boolean
  }>()

  // allMessages ya viene en desc, primero = más reciente por cada worker
  for (const msg of (allMessages ?? []) as (Record<string, unknown> & { worker_id: string; worker: { id: string; full_name: string; avatar_url: string | null }; body: string; created_at: string; is_from_admin: boolean; read_at: string | null })[]) {
    if (!convMap.has(msg.worker_id)) {
      convMap.set(msg.worker_id, {
        worker_id:     msg.worker_id,
        worker:        msg.worker,
        last_message:  msg.body,
        last_at:       msg.created_at,
        unread_count:  0,
        is_from_admin: msg.is_from_admin,
      })
    }
    // contar no leídos del trabajador (mensajes que el admin aún no ha leído)
    if (!msg.is_from_admin && !msg.read_at) {
      const conv = convMap.get(msg.worker_id)!
      conv.unread_count++
    }
  }

  return NextResponse.json({ data: Array.from(convMap.values()) })
}

// POST /api/messages
export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const isAdmin = ['admin', 'superadmin'].includes(auth.role)
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })

  const parsed = SendSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const adminClient = await createAdminClient()

  if (isAdmin) {
    // Admin debe proporcionar worker_id
    if (!parsed.data.worker_id) {
      return NextResponse.json({ error: 'worker_id requerido para admins' }, { status: 400 })
    }
    const { data, error } = await adminClient.from('messages').insert({
      sender_id:    auth.user.id,
      worker_id:    parsed.data.worker_id,
      body:         parsed.data.body,
      is_from_admin: true,
    }).select().single()

    if (error) return NextResponse.json({ error: 'Error al enviar mensaje' }, { status: 500 })
    return NextResponse.json({ data }, { status: 201 })
  }

  // Trabajador: worker_id es su propio id
  const { data, error } = await adminClient.from('messages').insert({
    sender_id:    auth.user.id,
    worker_id:    auth.user.id,
    body:         parsed.data.body,
    is_from_admin: false,
  }).select().single()

  if (error) return NextResponse.json({ error: 'Error al enviar mensaje' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}
