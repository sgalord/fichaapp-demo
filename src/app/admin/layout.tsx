'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, ClipboardList,
  LogOut, Users2, BarChart3, Menu, X, HardHat, CalendarDays, CalendarOff, MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

const NAV = [
  { href: '/admin',              label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/admin/workers',      label: 'Trabajadores', icon: Users },
  { href: '/admin/obras',        label: 'Obras',        icon: HardHat },
  { href: '/admin/asignaciones', label: 'Asignaciones', icon: CalendarDays },
  { href: '/admin/checkins',     label: 'Fichajes',     icon: ClipboardList },
  { href: '/admin/ausencias',    label: 'Ausencias',    icon: CalendarOff },
  { href: '/admin/groups',       label: 'Grupos',       icon: Users2 },
  { href: '/admin/reports',      label: 'Informes',     icon: BarChart3 },
  { href: '/admin/mensajes',     label: 'Mensajes',     icon: MessageSquare },
]

function MobileBottomNav() {
  const pathname = usePathname()
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 safe-bottom z-20">
      <div className="flex">
        {NAV.slice(0, 5).map(({ href, label, icon: Icon }) => {
          const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex-1 flex flex-col items-center py-2.5 gap-0.5 transition-colors',
                active ? 'text-white' : 'text-zinc-600'
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[9px] font-medium">{label.split(' ')[0]}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
              active
                ? 'bg-white/10 text-white'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
            )}
          >
            <Icon size={17} strokeWidth={active ? 2.5 : 1.8} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router   = useRouter()
  const supabase = createClient()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Verificación de rol client-side como segunda línea de defensa
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      supabase.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data: profile }) => {
          if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
            router.replace('/worker')
          }
        })
    })
  }, [supabase, router])

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-zinc-950">

      {/* ────────────────────── DESKTOP SIDEBAR ────────────────────── */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 bg-zinc-900 border-r border-zinc-800 z-30">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-zinc-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="BUILT" className="h-8 w-auto" />
          <span className="ml-auto text-[10px] font-medium text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">Admin</span>
        </div>

        {/* Nav */}
        <NavLinks />

        {/* Logout */}
        <div className="px-3 pb-5 pt-2 border-t border-zinc-800">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
          >
            <LogOut size={17} strokeWidth={1.8} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ────────────────────── MOBILE HEADER ────────────────────── */}
      <header className="lg:hidden sticky top-0 z-20 bg-zinc-900/95 backdrop-blur-md border-b border-zinc-800 safe-top">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="BUILT" className="h-7 w-auto" />
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            className="p-2 text-zinc-400 hover:text-white transition-colors"
          >
            <Menu size={22} />
          </button>
        </div>
      </header>

      {/* ────────────────────── MOBILE DRAWER ────────────────────── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 animate-fade-in">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-72 bg-zinc-900 border-r border-zinc-800 flex flex-col animate-slide-up">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.png" alt="BUILT" className="h-7 w-auto" />
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 text-zinc-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <NavLinks onNavigate={() => setDrawerOpen(false)} />
            <div className="px-3 pb-8 pt-2 border-t border-zinc-800">
              <button
                onClick={logout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
              >
                <LogOut size={17} />
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ────────────────────── MAIN CONTENT ────────────────────── */}
      <main className="lg:ml-64 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-10">
          {children}
        </div>
      </main>

      {/* ────────────────────── MOBILE BOTTOM NAV ────────────────────── */}
      <MobileBottomNav />
    </div>
  )
}
