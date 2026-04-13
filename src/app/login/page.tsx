'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-zinc-950" />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router   = useRouter()
  const params   = useSearchParams()
  const supabase = createClient()

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword]     = useState('')
  const [showPass, setShowPass]     = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const accountDisabled = params.get('error') === 'account_disabled'

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    let emailToUse = identifier.trim().toLowerCase()

    // Si no tiene @ → es un usuario, buscar su email
    if (!emailToUse.includes('@')) {
      try {
        const res = await fetch('/api/auth/username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: emailToUse }),
        })
        const json = await res.json()
        if (!json.email) {
          setError('Usuario o contraseña incorrectos')
          setLoading(false)
          return
        }
        emailToUse = json.email
      } catch {
        setError('Error de conexión. Inténtalo de nuevo.')
        setLoading(false)
        return
      }
    }

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password,
    })

    if (authError || !data.user) {
      setError('Usuario o contraseña incorrectos')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, active')
      .eq('id', data.user.id)
      .single()

    if (profile && !profile.active) {
      await supabase.auth.signOut()
      setError('Tu cuenta está desactivada. Contacta con tu empresa.')
      setLoading(false)
      return
    }

    const dest = profile?.role === 'worker' ? '/worker' : '/admin'
    router.push(dest)
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      {/* Background grid pattern */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-5 border-2 border-dashed border-zinc-700 rounded-xl px-6 py-4 bg-zinc-900/50">
            <span className="text-zinc-500 text-sm italic">Aquí va tu logo personalizado de tu empresa</span>
          </div>
          <p className="text-zinc-500 text-sm mt-1">Control de presencia</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
          {(accountDisabled || error) && (
            <div className="mb-5 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">
                {accountDisabled
                  ? 'Tu cuenta está desactivada. Contacta con tu empresa.'
                  : error}
              </p>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                Usuario o email
              </label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                placeholder="nombre.apellido o tu@email.com"
                required
                autoComplete="username"
                autoCapitalize="none"
                className="input"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Contraseña</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="input pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1 transition-colors"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full mt-2 gap-2"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Entrando...</>
                : 'Iniciar sesión'
              }
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/forgot-password"
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-6">
          ¿Problemas para acceder? Contacta con tu empresa.
        </p>
      </div>
    </div>
  )
}
