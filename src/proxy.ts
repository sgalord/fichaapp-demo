import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> }

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh de la sesión (obligatorio para @supabase/ssr)
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rutas públicas — siempre accesibles
  if (pathname.startsWith('/login') || pathname.startsWith('/api/')) {
    return supabaseResponse
  }

  // Sin sesión → login
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Obtener rol del usuario (solo los campos necesarios)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, active')
    .eq('id', user.id)
    .single()

  // Cuenta desactivada
  if (profile && !profile.active) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL('/login?error=account_disabled', request.url)
    )
  }

  const role = profile?.role ?? 'worker'

  // Redirigir raíz según rol
  if (pathname === '/') {
    const dest = role === 'worker' ? '/worker' : '/admin'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // Trabajadores no pueden acceder a /admin
  if (pathname.startsWith('/admin') && role === 'worker') {
    return NextResponse.redirect(new URL('/worker', request.url))
  }

  // Admins redirigir de /worker a /admin
  if (pathname.startsWith('/worker') && role !== 'worker') {
    return NextResponse.redirect(new URL('/admin', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
