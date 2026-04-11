import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export const runtime = 'edge'

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  // Intentar con Bearer token primero (clientes que lo envían explícitamente)
  const authHeader = request.headers.get('authorization') ?? ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    )
    const { data: { user } } = await supabase.auth.getUser(token)
    return !!user
  }
  // Fallback: cookies de sesión SSR
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return !!user
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
  address?: {
    road?: string
    house_number?: string
    city?: string
    town?: string
    village?: string
    state?: string
    country?: string
  }
}

function buildLabel(result: NominatimResult): string {
  const addr = result.address
  if (!addr) return result.display_name

  const parts: string[] = []

  const street = [addr.road, addr.house_number].filter(Boolean).join(' ')
  if (street) parts.push(street)

  const locality = addr.city ?? addr.town ?? addr.village
  if (locality) parts.push(locality)

  if (addr.state) parts.push(addr.state)

  return parts.length > 0 ? parts.join(', ') : result.display_name
}

export async function GET(request: NextRequest) {
  if (!await isAuthenticated(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address') ?? searchParams.get('q') ?? ''

  if (!address || address.trim().length < 3) {
    return NextResponse.json({ error: 'Dirección demasiado corta' }, { status: 400 })
  }

  const rawLimit = parseInt(searchParams.get('limit') ?? '1', 10)
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 1
  const isAutocomplete = limit > 1

  try {
    const params = new URLSearchParams({
      q: address.trim(),
      format: 'json',
      limit: String(limit),
      addressdetails: isAutocomplete ? '1' : '0',
    })

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BUILT-FichaApp/1.0 (built-app@gmail.com)',
        'Accept-Language': 'es',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Error en el servicio de geocodificación' }, { status: 502 })
    }

    const data: NominatimResult[] = await res.json()

    if (!data || data.length === 0) {
      if (isAutocomplete) {
        return NextResponse.json(
          [],
          { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } },
        )
      }
      return NextResponse.json({ error: 'Dirección no encontrada' }, { status: 404 })
    }

    const cacheControl = isAutocomplete
      ? 'public, s-maxage=300, stale-while-revalidate=600'
      : 'public, s-maxage=3600, stale-while-revalidate=86400'

    if (!isAutocomplete) {
      const first = data[0]
      return NextResponse.json(
        {
          latitude:     parseFloat(first.lat),
          longitude:    parseFloat(first.lon),
          display_name: first.display_name,
        },
        { headers: { 'Cache-Control': cacheControl } },
      )
    }

    const results = data.map((item) => ({
      latitude:     parseFloat(item.lat),
      longitude:    parseFloat(item.lon),
      display_name: item.display_name,
      label:        buildLabel(item),
    }))

    return NextResponse.json(results, { headers: { 'Cache-Control': cacheControl } })
  } catch {
    return NextResponse.json({ error: 'Error inesperado al geocodificar' }, { status: 500 })
  }
}
