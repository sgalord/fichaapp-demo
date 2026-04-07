'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { HardHat, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-orange-500" />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const supabase = createClient()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const accountDisabled = params.get('error') === 'account_disabled'

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (authError) {
      setError('Email o contraseña incorrectos')
      setLoading(false)
      return
    }

    if (!data.user) {
      setError('No se pudo iniciar sesión')
      setLoading(false)
      return
    }

    // Obtener rol para redirigir
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
    <div className="min-h-screen bg-gradient-to-b from-orange-500 to-orange-600 flex flex-col">
      {/* Header */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-16 pb-8">
        <div className="bg-white/20 rounded-3xl p-5 mb-6">
          <HardHat className="w-14 h-14 text-white" strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl font-bold text-white mb-1">FichaApp</h1>
        <p className="text-orange-100 text-sm">Sistema de control de presencia</p>
      </div>

      {/* Card de login */}
      <div className="bg-white rounded-t-3xl px-6 pt-8 pb-10 safe-bottom">
        {accountDisabled && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm">
            Tu cuenta está desactivada. Contacta con tu empresa.
          </div>
        )}

        <h2 className="text-xl font-bold text-gray-900 mb-6">Iniciar sesión</h2>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoComplete="email"
              className="input"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1.5 block">
              Contraseña
            </label>
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
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 p-1"
              >
                {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-sm bg-red-50 rounded-xl px-4 py-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <><Loader2 size={20} className="animate-spin" /> Entrando...</>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          ¿Problemas para acceder? Contacta con tu empresa.
        </p>
      </div>
    </div>
  )
}
