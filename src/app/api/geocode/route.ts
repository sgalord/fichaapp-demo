import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q || q.trim().length < 3) {
    return NextResponse.json([], { status: 200 })
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=0`

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'BUILT-FichaApp/1.0 (built-app@gmail.com)',
        'Accept-Language': 'es',
      },
      // Cache 5 minutos en edge
      // @ts-ignore
      cf: { cacheTtl: 300 },
    })

    if (!res.ok) {
      return NextResponse.json([], { status: 200 })
    }

    const data = await res.json()
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    })
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
