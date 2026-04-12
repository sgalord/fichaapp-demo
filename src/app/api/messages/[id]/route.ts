import { NextRequest, NextResponse } from 'next/server'
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

// DELETE /api/messages/[id] — solo admins y superadmins
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthUser(req)
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!['admin', 'superadmin'].includes(auth.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const adminClient = await createAdminClient()
  const { error } = await adminClient.from('messages').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Error al eliminar' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
