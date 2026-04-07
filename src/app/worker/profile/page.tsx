'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/types'
import {
  ArrowLeft, Camera, Loader2, CheckCircle2, AlertCircle,
  User, Lock, Calendar, CreditCard, Star, Eye, EyeOff,
} from 'lucide-react'

// Comprime y recorta avatar a 256×256
async function compressAvatar(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const SIZE = 256
      const canvas = document.createElement('canvas')
      canvas.width = SIZE; canvas.height = SIZE
      const ctx = canvas.getContext('2d')!
      const min = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, SIZE, SIZE)
      URL.revokeObjectURL(url)
      canvas.toBlob(b => (b ? resolve(b) : reject()), 'image/jpeg', 0.85)
    }
    img.onerror = reject; img.src = url
  })
}

export default function WorkerProfilePage() {
  const supabase = createClient()
  const router   = useRouter()

  const [profile, setProfile]     = useState<Profile | null>(null)
  const [loading, setLoading]     = useState(true)
  const avatarInputRef            = useRef<HTMLInputElement>(null)

  // Form estado
  const [fullName, setFullName]   = useState('')
  const [birthday, setBirthday]   = useState('')
  const [dni, setDni]             = useState('')
  const [specialty, setSpecialty] = useState('')

  // Password estado
  const [newPass, setNewPass]     = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showPass, setShowPass]   = useState(false)

  // UI estado
  const [savingProfile, setSavingProfile]   = useState(false)
  const [savingPass, setSavingPass]         = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [profileMsg, setProfileMsg]         = useState<{ text: string; ok: boolean } | null>(null)
  const [passMsg, setPassMsg]               = useState<{ text: string; ok: boolean } | null>(null)

  const loadProfile = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: prof } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, active, avatar_url, birthday, dni, specialty, created_at, updated_at')
      .eq('id', user.id)
      .single()

    if (prof) {
      setProfile(prof as Profile)
      setFullName(prof.full_name ?? '')
      setBirthday(prof.birthday ?? '')
      setDni(prof.dni ?? '')
      setSpecialty(prof.specialty ?? '')
    }
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { loadProfile() }, [loadProfile])

  // ── Avatar ────────────────────────────────────────────────────────────────
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !profile) return
    e.target.value = ''; setUploadingAvatar(true)
    try {
      const blob = await compressAvatar(file)
      const filename = `${profile.id}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars')
        .upload(filename, blob, { contentType: 'image/jpeg', upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filename)
        const url = `${publicUrl}?t=${Date.now()}`
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id)
        setProfile(p => p ? { ...p, avatar_url: url } : p)
      }
    } finally { setUploadingAvatar(false) }
  }

  // ── Guardar perfil ────────────────────────────────────────────────────────
  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSavingProfile(true); setProfileMsg(null)
    const { error } = await supabase.from('profiles').update({
      full_name: fullName.trim(),
      birthday:  birthday || null,
      dni:       dni.trim() || null,
      specialty: specialty.trim() || null,
    }).eq('id', profile.id)

    if (error) {
      setProfileMsg({ text: 'Error al guardar. Inténtalo de nuevo.', ok: false })
    } else {
      setProfileMsg({ text: 'Perfil actualizado correctamente.', ok: true })
      await loadProfile()
    }
    setSavingProfile(false)
  }

  // ── Cambiar contraseña ────────────────────────────────────────────────────
  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault()
    setPassMsg(null)
    if (newPass.length < 6) { setPassMsg({ text: 'Mínimo 6 caracteres.', ok: false }); return }
    if (newPass !== confirmPass) { setPassMsg({ text: 'Las contraseñas no coinciden.', ok: false }); return }

    setSavingPass(true)
    const { error } = await supabase.auth.updateUser({ password: newPass })
    if (error) {
      setPassMsg({ text: 'Error al cambiar la contraseña.', ok: false })
    } else {
      setPassMsg({ text: 'Contraseña cambiada correctamente.', ok: true })
      setNewPass(''); setConfirmPass('')
    }
    setSavingPass(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col max-w-md mx-auto">

      {/* ── Header ── */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 pt-12 pb-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 -ml-2 text-zinc-500 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">Mi perfil</h1>
            <p className="text-xs text-zinc-500">Edita tu información personal</p>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6 pb-12">

        {/* ── Avatar ── */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
              onChange={handleAvatarChange} id="profile-avatar" />
            <label htmlFor="profile-avatar" className="cursor-pointer group relative block">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.full_name}
                  className="w-24 h-24 rounded-full object-cover border-2 border-zinc-700"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center">
                  <User size={36} className="text-zinc-500" />
                </div>
              )}
              {/* Overlay */}
              <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                {uploadingAvatar
                  ? <Loader2 size={20} className="text-white animate-spin" />
                  : <>
                      <Camera size={20} className="text-white" />
                      <span className="text-[10px] text-white font-medium">Cambiar</span>
                    </>
                }
              </div>
            </label>
          </div>
          <p className="text-xs text-zinc-500">Pulsa la foto para cambiarla</p>
        </div>

        {/* ── Formulario datos personales ── */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <User size={14} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">Datos personales</h2>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Nombre completo</label>
            <input
              type="text"
              className="input"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Tu nombre completo"
              required
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <Calendar size={12} />Fecha de nacimiento
            </label>
            <input
              type="date"
              className="input"
              value={birthday}
              onChange={e => setBirthday(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <CreditCard size={12} />DNI / NIE
            </label>
            <input
              type="text"
              className="input"
              value={dni}
              onChange={e => setDni(e.target.value.toUpperCase())}
              placeholder="12345678A"
              maxLength={20}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <Star size={12} />Especialidad
            </label>
            <textarea
              className="input min-h-[90px] resize-none"
              value={specialty}
              onChange={e => setSpecialty(e.target.value)}
              placeholder="Ej: Electricidad de baja tensión, soldadura TIG, albañilería..."
              maxLength={300}
            />
            <p className="text-xs text-zinc-600 mt-1 text-right">{specialty.length}/300</p>
          </div>

          {profileMsg && (
            <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm ${
              profileMsg.ok
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              {profileMsg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {profileMsg.text}
            </div>
          )}

          <button type="submit" disabled={savingProfile} className="btn-primary w-full gap-2">
            {savingProfile ? <><Loader2 size={15} className="animate-spin" />Guardando...</> : 'Guardar datos personales'}
          </button>
        </form>

        {/* ── Divisor ── */}
        <div className="border-t border-zinc-800" />

        {/* ── Cambiar contraseña ── */}
        <form onSubmit={handleSavePassword} className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Lock size={14} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-300">Cambiar contraseña</h2>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Nueva contraseña</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                className="input pr-12"
                value={newPass}
                onChange={e => setNewPass(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1">
                {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-zinc-400 mb-1.5 block">Confirmar contraseña</label>
            <input
              type={showPass ? 'text' : 'password'}
              className={`input ${confirmPass && confirmPass !== newPass ? 'border-red-500/50' : ''}`}
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              placeholder="Repite la contraseña"
              autoComplete="new-password"
            />
            {confirmPass && confirmPass !== newPass && (
              <p className="text-xs text-red-400 mt-1">Las contraseñas no coinciden</p>
            )}
          </div>

          {passMsg && (
            <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm ${
              passMsg.ok
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              {passMsg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
              {passMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={savingPass || !newPass || confirmPass !== newPass}
            className="btn-secondary w-full gap-2"
          >
            {savingPass ? <><Loader2 size={15} className="animate-spin" />Cambiando...</> : 'Cambiar contraseña'}
          </button>
        </form>
      </main>
    </div>
  )
}
