import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  // Acepta tanto ?address= (obras page) como ?q= (legacy)
  const address = searchParams.get('address') ?? searchParams.get('q') ?? ''

  if (!address || address.trim().length < 3) {
    return NextResponse.json({ error: 'Dirección demasiado corta' }, { status: 400 })
  }

  try {
    const url =
      `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(address.trim())}&format=json&limit=1&addressdetails=0&countrycodes=es`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BUILT-FichaApp/1.0 (built-app@gmail.com)',
        'Accept-Language': 'es',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: 'Error en el servicio de geocodificación' }, { status: 502 })
    }

    const data: { lat: string; lon: string; display_name: string }[] = await res.json()

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Dirección no encontrada' }, { status: 404 })
    }

    const first = data[0]
    return NextResponse.json(
      {
        latitude:     parseFloat(first.lat),
        longitude:    parseFloat(first.lon),
        display_name: first.display_name,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } },
    )
  } catch {
    return NextResponse.json({ error: 'Error inesperado al geocodificar' }, { status: 500 })
  }
}
