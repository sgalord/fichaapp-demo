import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const { username } = await req.json()
  if (!username) return NextResponse.json({ error: 'Username requerido' }, { status: 400 })

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username.trim().toLowerCase())
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(data.id)
  if (authError || !authUser?.user?.email) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ email: authUser.user.email })
}
