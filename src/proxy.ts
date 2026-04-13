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

  const { pathname } = request.nextUrl

  // Rutas publicas — siempre accesibles (incluyendo landing /)
  if (
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/privacidad')
  ) {
    return supabaseResponse
  }

  // Refresh de la sesion (obligatorio para @supabase/ssr)
  const { data: { user } } = await supabase.auth.getUser()

  // Sin sesion → login
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
