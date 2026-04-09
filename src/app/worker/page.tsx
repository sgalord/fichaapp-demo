'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  haversineDistance, formatTime, formatDate, distanceLabel,
  todayISO, tomorrowISO, mapsUrl,
} from '@/lib/utils'
import { getDeviceFingerprint } from '@/lib/device-fingerprint'
import type { Profile, CheckIn } from '@/types'
import {
  MapPin, Clock, CheckCircle2, XCircle, LogOut,
  Navigation, AlertTriangle, ChevronRight, Loader2, RefreshCw,
  Camera, X, Image, UserCircle, HardHat, CalendarDays,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type GeoStatus = 'idle' | 'loading' | 'ok' | 'error'

interface ObraInfo {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  radius: number
}

// Comprime imagen a max 1280px y calidad 0.82 antes de subir
async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const MAX = 1280
      const ratio = Math.min(1, MAX / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * ratio)
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
        'image/jpeg',
        0.82,
      )
    }
    img.onerror = reject
    img.src = url
  })
}

export default function WorkerPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [profile, setProfile]             = useState<Profile | null>(null)
  const [todayObra, setTodayObra]         = useState<ObraInfo | null>(null)
  const [tomorrowObra, setTomorrowObra]   = useState<ObraInfo | null>(null)
  const [todayCheckIns, setTodayCheckIns] = useState<CheckIn[]>([])
  const [userCoords, setUserCoords]       = useState<{ lat: number; lng: number } | null>(null)
  const [distance, setDistance]           = useState<number | null>(null)
  const [geoStatus, setGeoStatus]         = useState<GeoStatus>('idle')
  const [checking, setChecking]           = useState(false)
  const [message, setMessage]             = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [dataLoading, setDataLoading]     = useState(true)

  // Foto de fichaje
  const photoInputRef                     = useRef<HTMLInputElement>(null)
  const [photoFile, setPhotoFile]         = useState<File | null>(null)
  const [photoPreview, setPhotoPreview]   = useState<string | null>(null)
  const [uploading, setUploading]         = useState(false)

  // Avatar de perfil
  const avatarInputRef                    = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: prof }, { data: checkIns }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role,active,avatar_url,username').eq('id', user.id).single(),
      supabase.from('check_ins')
        .select('id,type,timestamp,distance_meters,within_radius,work_location_id,photo_url')
        .eq('worker_id', user.id)
        .gte('timestamp', `${todayISO()}T00:00:00`)
        .order('timestamp', { ascending: false })
        .limit(10),
    ])

    setProfile(prof as Profile)
    setTodayCheckIns((checkIns ?? []) as CheckIn[])

    // Obtener obra de hoy y mañana via API (bypasses RLS issues)
    const today    = todayISO()
    const tomorrow = tomorrowISO()

    const [todayRes, tomorrowRes] = await Promise.all([
      fetch(`/api/obra-assignments?date=${today}`),
      fetch(`/api/obra-assignments?date=${tomorrow}`),
    ])
    const todayData    = todayRes.ok    ? (await todayRes.json()).data    : []
    const tomorrowData = tomorrowRes.ok ? (await tomorrowRes.json()).data : []

    setTodayObra(todayData?.[0]?.obra ?? null)
    setTomorrowObra(tomorrowData?.[0]?.obra ?? null)

    setDataLoading(false)
  }, [supabase, router])

  useEffect(() => { loadData() }, [loadData])

  // Limpiar object URL al desmontar
  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }
  }, [photoPreview])

  function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('GPS no disponible')); return }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 15000, maximumAge: 0,
      })
    })
  }

  async function locateMe() {
    setGeoStatus('loading')
    setMessage(null)
    try {
      const pos    = await getPosition()
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setUserCoords(coords)
      if (todayObra?.latitude && todayObra?.longitude) {
        setDistance(haversineDistance(coords.lat, coords.lng, todayObra.latitude, todayObra.longitude))
      }
      setGeoStatus('ok')
    } catch {
      setGeoStatus('error')
      setMessage({ text: 'No se pudo obtener tu ubicación. Activa el GPS.', type: 'err' })
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !profile) return
    e.target.value = ''; setUploadingAvatar(true)
    try {
      const blob = await compressImage(file)
      const filename = `${profile.id}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars')
        .upload(filename, blob, { contentType: 'image/jpeg', upsert: true })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filename)
        await supabase.from('profiles').update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq('id', profile.id)
        await loadData()
      }
    } finally { setUploadingAvatar(false) }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    e.target.value = ''
  }

  function removePhoto() {
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  const nextType: 'in' | 'out'  = todayCheckIns[0]?.type === 'in' ? 'out' : 'in'
  const withinRadius = distance !== null && todayObra !== null && distance <= todayObra.radius

  async function handleCheckIn() {
    if (!userCoords || !profile || !photoFile) return
    setChecking(true)
    setUploading(true)
    setMessage(null)

    let photo_url: string | null = null

    // 1. Subir foto
    try {
      const compressed = await compressImage(photoFile)
      const filename   = `${profile.id}/${Date.now()}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('checkin-photos')
        .upload(filename, compressed, { contentType: 'image/jpeg' })
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('checkin-photos').getPublicUrl(filename)
        photo_url = publicUrl
      }
    } catch (err) {
      console.warn('Error uploading photo:', err)
    }
    setUploading(false)

    // 2. Huella del dispositivo
    const device_fingerprint = await getDeviceFingerprint().catch(() => null)

    // 3. Registrar fichaje
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: nextType,
          latitude: userCoords.lat,
          longitude: userCoords.lng,
          obra_id: todayObra?.id ?? null,
          photo_url,
          device_fingerprint,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al fichar')
      setMessage({
        text: nextType === 'in' ? '¡Entrada registrada!' : '¡Salida registrada!',
        type: 'ok',
      })
      removePhoto()
      setGeoStatus('idle')
      setUserCoords(null)
      setDistance(null)
      await loadData()
    } catch (e: unknown) {
      setMessage({ text: e instanceof Error ? e.message : 'Error inesperado', type: 'err' })
    } finally {
      setChecking(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (dataLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-zinc-400 animate-spin" />
      </div>
    )
  }

  const canCheckIn = geoStatus === 'ok' && !!photoFile && !checking

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col max-w-md mx-auto">

      {/* ── Header ── */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 pt-12 pb-5 safe-top sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar con opción de cambio */}
            <div className="relative flex-shrink-0">
              <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
                onChange={handleAvatarChange} id="worker-avatar" />
              <label htmlFor="worker-avatar" className="cursor-pointer group relative block" title="Cambiar foto de perfil">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt={profile?.full_name ?? ''}
                    className="w-9 h-9 rounded-full object-cover border border-zinc-700" />
                ) : (
                  <div className="w-9 h-9 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center">
                    {uploadingAvatar
                      ? <Loader2 size={14} className="text-zinc-400 animate-spin" />
                      : <UserCircle size={16} className="text-zinc-500" />
                    }
                  </div>
                )}
                <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  {uploadingAvatar ? <Loader2 size={11} className="text-white animate-spin" /> : <Camera size={11} className="text-white" />}
                </div>
              </label>
            </div>
            <div>
              <p className="text-zinc-500 text-xs">Hola,</p>
              <p className="text-white font-semibold text-sm leading-tight">{profile?.full_name}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <LogOut size={18} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500">
          <Clock size={13} />
          <span className="capitalize">{formatDate(new Date())}</span>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 pb-10">

        {/* ── Obra de hoy ── */}
        <div className="card">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <p className="section-title mb-1.5 flex items-center gap-1.5">
                <HardHat size={13} className="text-amber-400" />Obra de hoy
              </p>
              {todayObra ? (
                <>
                  <h2 className="font-bold text-white text-lg leading-tight">{todayObra.name}</h2>
                  {todayObra.address && (
                    <p className="text-sm text-zinc-500 mt-0.5 truncate">{todayObra.address}</p>
                  )}
                </>
              ) : (
                <p className="text-zinc-600 text-sm">No hay obra asignada para hoy</p>
              )}
            </div>
            {todayObra?.latitude && todayObra?.longitude && (
              <a
                href={mapsUrl(todayObra.latitude, todayObra.longitude, todayObra.name)}
                target="_blank" rel="noopener noreferrer"
                className="ml-3 p-2.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white flex-shrink-0"
              >
                <MapPin size={18} />
              </a>
            )}
          </div>

          {todayObra && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge-gray">Radio: {todayObra.radius} m</span>
              {distance !== null && (
                <span className={withinRadius ? 'badge-green' : 'badge-red'}>
                  {withinRadius ? '✓ Dentro del radio' : `Fuera — ${distanceLabel(distance)}`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Obra de mañana ── */}
        {tomorrowObra && (
          <div className="card border-zinc-800/50 bg-zinc-900/50">
            <p className="section-title mb-1.5 flex items-center gap-1.5">
              <CalendarDays size={13} className="text-zinc-500" />Mañana
            </p>
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-zinc-300">{tomorrowObra.name}</p>
                {tomorrowObra.address && (
                  <p className="text-xs text-zinc-600 mt-0.5 truncate">{tomorrowObra.address}</p>
                )}
              </div>
              {tomorrowObra.latitude && tomorrowObra.longitude && (
                <a
                  href={mapsUrl(tomorrowObra.latitude, tomorrowObra.longitude, tomorrowObra.name)}
                  target="_blank" rel="noopener noreferrer"
                  className="ml-3 p-2 rounded-lg bg-zinc-800 text-zinc-500 hover:text-white flex-shrink-0"
                >
                  <MapPin size={15} />
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── GPS + Foto + Fichaje ── */}
        {todayObra ? (
          <div className="space-y-3">

            {/* Paso 1: GPS */}
            <div className="space-y-1">
              <p className="text-xs font-medium text-zinc-500 px-1">1 · Ubicación GPS</p>
              <button
                onClick={locateMe}
                disabled={geoStatus === 'loading'}
                className={`w-full flex items-center justify-center gap-3 rounded-xl px-5 py-4 text-sm font-medium transition-all border ${
                  geoStatus === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                }`}
              >
                {geoStatus === 'loading'
                  ? <Loader2 size={18} className="animate-spin" />
                  : <Navigation size={18} />
                }
                {geoStatus === 'ok'
                  ? `GPS obtenido · ${distanceLabel(distance!)}`
                  : geoStatus === 'loading'
                  ? 'Obteniendo ubicación...'
                  : 'Obtener mi ubicación GPS'
                }
              </button>
            </div>

            {/* Paso 2: Foto (aparece al obtener GPS) */}
            {geoStatus === 'ok' && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-zinc-500 px-1">2 · Fotografía</p>

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoChange}
                />

                {photoPreview ? (
                  <div className="relative rounded-xl overflow-hidden border border-zinc-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreview}
                      alt="Foto del fichaje"
                      className="w-full h-40 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-2 left-3 flex items-center gap-1.5 text-xs text-white/80">
                      <CheckCircle2 size={13} className="text-emerald-400" />
                      Foto lista
                    </div>
                    <button
                      onClick={removePhoto}
                      className="absolute top-2 right-2 bg-zinc-900/80 backdrop-blur-sm rounded-full p-1.5 text-zinc-300 hover:text-white transition-colors"
                    >
                      <X size={14} />
                    </button>
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="absolute bottom-2 right-3 bg-zinc-900/80 backdrop-blur-sm rounded-lg px-2.5 py-1 text-xs text-zinc-300 hover:text-white flex items-center gap-1 transition-colors"
                    >
                      <Camera size={11} /> Repetir
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => photoInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-3 rounded-xl px-5 py-4 text-sm font-medium bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-600 transition-all"
                  >
                    <Camera size={18} />
                    Tomar fotografía (obligatorio)
                  </button>
                )}
              </div>
            )}

            {/* Aviso fuera de radio */}
            {geoStatus === 'ok' && !withinRadius && todayObra?.latitude && (
              <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5">
                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-300">
                  Estás a <strong>{distanceLabel(distance!)}</strong> de la obra.
                  El radio es {todayObra.radius} m. El fichaje se registrará como incidencia.
                </p>
              </div>
            )}

            {/* Paso 3: Botón fichar */}
            <div className="space-y-1">
              {geoStatus === 'ok' && (
                <p className="text-xs font-medium text-zinc-500 px-1">3 · Fichar</p>
              )}
              <button
                onClick={handleCheckIn}
                disabled={!canCheckIn}
                className={`w-full flex items-center justify-center gap-3 rounded-xl px-6 py-5 text-base font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
                  nextType === 'in'
                    ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                    : 'bg-red-500 text-white hover:bg-red-400'
                }`}
              >
                {checking
                  ? <>
                      <Loader2 size={22} className="animate-spin" />
                      {uploading ? 'Subiendo foto...' : 'Registrando...'}
                    </>
                  : nextType === 'in'
                  ? <><CheckCircle2 size={22} />Registrar Entrada</>
                  : <><XCircle size={22} />Registrar Salida</>
                }
              </button>
              {geoStatus !== 'ok' && (
                <p className="text-xs text-zinc-600 text-center pt-1">
                  Primero obtén tu ubicación GPS
                </p>
              )}
              {geoStatus === 'ok' && !photoFile && (
                <p className="text-xs text-zinc-600 text-center pt-1">
                  Falta la fotografía del paso 2
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="card border-dashed flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
            <p className="text-sm text-zinc-500">
              No tienes obra asignada hoy. Contacta con tu encargado.
            </p>
          </div>
        )}

        {/* ── Mensaje resultado ── */}
        {message && (
          <div className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === 'ok'
              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border border-red-500/20 text-red-400'
          }`}>
            {message.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {message.text}
          </div>
        )}

        {/* ── Fichajes de hoy ── */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-zinc-300">Fichajes de hoy</h3>
            <button onClick={loadData} className="p-1.5 text-zinc-600 hover:text-zinc-400 rounded-lg">
              <RefreshCw size={14} />
            </button>
          </div>

          {todayCheckIns.length === 0 ? (
            <p className="text-sm text-zinc-600 text-center py-4">Sin fichajes hoy</p>
          ) : (
            <div className="space-y-1">
              {todayCheckIns.map((ci) => (
                <div key={ci.id} className="flex items-center justify-between py-2.5 border-b border-zinc-800 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={ci.type === 'in' ? 'badge-green' : 'badge-red'}>
                      {ci.type === 'in' ? 'Entrada' : 'Salida'}
                    </span>
                    {!ci.within_radius && <span className="badge-orange">Fuera radio</span>}
                    {ci.photo_url && (
                      <a
                        href={ci.photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Ver foto"
                      >
                        <Image size={13} />
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-zinc-200">{formatTime(ci.timestamp)}</span>
                    {ci.distance_meters !== null && (
                      <p className="text-xs text-zinc-600">{distanceLabel(ci.distance_meters)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Historial + Perfil ── */}
        <Link href="/worker/history" className="card-hover flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Clock size={16} className="text-zinc-500" />
            <span className="text-sm font-medium text-zinc-400">Ver historial completo</span>
          </div>
          <ChevronRight size={16} className="text-zinc-600" />
        </Link>
        <Link href="/worker/profile" className="card-hover flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <UserCircle size={16} className="text-zinc-500" />
            <span className="text-sm font-medium text-zinc-400">Mi perfil</span>
          </div>
          <ChevronRight size={16} className="text-zinc-600" />
        </Link>
      </main>
    </div>
  )
}
