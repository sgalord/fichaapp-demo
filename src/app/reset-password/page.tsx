'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Building2, Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, KeyRound } from 'lucide-react'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPass, setShowPass]   = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [done, setDone]           = useState(false)
  const [ready, setReady]         = useState(false)
  const [checking, setChecking]   = useState(true)

  useEffect(() => {
    // Verificar que el usuario tiene sesión válida (viene del enlace de recuperación)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
        setChecking(false)
      }
    })

    // Comprobar sesión existente (ej. viene del callback PKCE)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setReady(true)
      }
      setChecking(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError('No se pudo actualizar la contraseña. El enlace puede haber expirado.')
      setLoading(false)
      return
    }

    setDone(true)
    // Cerrar sesión y redirigir al login tras 2.5 s
    setTimeout(async () => {
      await supabase.auth.signOut()
      router.push('/login')
    }, 2500)
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      {/* Background grid */}
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
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-5 shadow-lg shadow-white/5">
            <Building2 size={30} className="text-zinc-950" strokeWidth={1.5} />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">BUILT</h1>
          <p className="text-zinc-500 text-sm mt-1">Control de presencia</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">

          {checking ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-7 h-7 text-zinc-400 animate-spin" />
            </div>
          ) : done ? (
            /* ── Éxito ── */
            <div className="text-center py-2">
              <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={28} className="text-emerald-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">¡Contraseña actualizada!</h2>
              <p className="text-sm text-zinc-400">
                Tu contraseña se ha cambiado correctamente. Redirigiendo al inicio de sesión...
              </p>
              <Loader2 className="w-5 h-5 text-zinc-500 animate-spin mx-auto mt-4" />
            </div>
          ) : !ready ? (
            /* ── Enlace inválido ── */
            <div className="text-center py-2">
              <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={28} className="text-red-400" />
              </div>
              <h2 className="text-lg font-bold text-white mb-2">Enlace inválido</h2>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Este enlace de recuperación no es válido o ha expirado.
                Solicita uno nuevo desde la pantalla de inicio de sesión.
              </p>
              <button
                onClick={() => router.push('/forgot-password')}
                className="btn-primary mt-5 w-full"
              >
                Solicitar nuevo enlace
              </button>
            </div>
          ) : (
            /* ── Formulario nueva contraseña ── */
            <>
              <div className="mb-5">
                <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center mb-3">
                  <KeyRound size={18} className="text-zinc-300" />
                </div>
                <h2 className="text-lg font-bold text-white">Nueva contraseña</h2>
                <p className="text-sm text-zinc-500 mt-1">
                  Elige una contraseña segura para tu cuenta.
                </p>
              </div>

              {error && (
                <div className="mb-4 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <form onSubmit={handleReset} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      required
                      minLength={6}
                      autoComplete="new-password"
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

                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                    Confirmar contraseña
                  </label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Repite la contraseña"
                    required
                    autoComplete="new-password"
                    className={`input ${
                      confirm && confirm !== password
                        ? 'border-red-500/50 focus:border-red-500'
                        : ''
                    }`}
                  />
                  {confirm && confirm !== password && (
                    <p className="text-xs text-red-400 mt-1.5">Las contraseñas no coinciden</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || (!!confirm && confirm !== password)}
                  className="btn-primary w-full gap-2"
                >
                  {loading
                    ? <><Loader2 size={16} className="animate-spin" />Actualizando...</>
                    : 'Guardar nueva contraseña'
                  }
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
