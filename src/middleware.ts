import { NextResponse, type NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Block Vercel toolbar script requests
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/_vercel/toolbar') || pathname.startsWith('/_vercel/speed-insights')) {
    return new NextResponse(null, { status: 204 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/_vercel/toolbar/:path*', '/_vercel/speed-insights/:path*'],
}
