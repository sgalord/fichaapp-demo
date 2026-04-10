import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limiting: 10 intentos por IP cada 15 minutos
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'

  const { success, remaining, resetAt } = rateLimit(`username:${ip}`, 10, 15 * 60 * 1000)

  if (!success) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Inténtalo de nuevo en unos minutos.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0',
        },
      }
    )
  }

  const body = await req.json().catch(() => null)
  const username = typeof body?.username === 'string' ? body.username.trim().toLowerCase() : null
  if (!username) return NextResponse.json({ error: 'Username requerido' }, { status: 400 })

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single()

  if (error || !data) {
    // Respuesta genérica para no filtrar si el username existe o no
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 404 })
  }

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(data.id)
  if (authError || !authUser?.user?.email) {
    return NextResponse.json({ error: 'Credenciales incorrectas' }, { status: 404 })
  }

  return NextResponse.json(
    { email: authUser.user.email },
    { headers: { 'X-RateLimit-Remaining': String(remaining) } }
  )
}
