import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FichaApp – Control de presencia inteligente',
  description: 'Fichaje por GPS y foto, gestión de ausencias, informes y mensajería. Para empresas de cualquier sector con personal en campo.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FichaApp',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#09090b',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <head>
        {/* Aggressively remove Vercel toolbar */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.VERCEL_TOOLBAR_ENABLED=false;
          new MutationObserver(function(m,o){
            document.querySelectorAll('vercel-toolbar, vercel-live-feedback, vercel-toolbar-portal, [data-vercel-toolbar], [id*="vercel"], vercel-feedback').forEach(function(el){el.remove()});
          }).observe(document.documentElement,{childList:true,subtree:true});
        `}} />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="min-h-screen bg-zinc-950">
        {children}
      </body>
    </html>
  )
}
