'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Users, MapPin, ClipboardList, LogOut, HardHat
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/admin',           label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/admin/workers',   label: 'Trabajadores', icon: Users },
  { href: '/admin/locations', label: 'Ubicaciones',  icon: MapPin },
  { href: '/admin/checkins',  label: 'Fichajes',     icon: ClipboardList },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-2xl mx-auto">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-100 px-4 pt-10 pb-3 safe-top sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardHat size={22} className="text-orange-500" />
            <span className="font-bold text-gray-900">FichaApp</span>
            <span className="badge-orange ml-1">Admin</span>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 text-sm text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl"
          >
            <LogOut size={15} />
            Salir
          </button>
        </div>
      </header>

      {/* Contenido */}
      <main className="flex-1 pb-24">
        {children}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white border-t border-gray-100 safe-bottom z-20">
        <div className="flex">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex-1 flex flex-col items-center py-2.5 gap-0.5 text-xs font-medium transition-colors',
                  active ? 'text-orange-500' : 'text-gray-400'
                )}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
