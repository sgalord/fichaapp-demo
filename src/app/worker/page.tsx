'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  haversineDistance, formatTime, formatDate, distanceLabel,
  todayISO, mapsUrl, initials, avatarColor,
} from '@/lib/utils'
import type { Profile, WorkLocation, CheckIn } from '@/types'
import {
  MapPin, Clock, CheckCircle2, XCircle, LogOut,
  Navigation, AlertTriangle, ChevronRight, Loader2, RefreshCw,
  Building2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type GeoStatus = 'idle' | 'loading' | 'ok' | 'error'

export default function WorkerPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [profile, setProfile]             = useState<Profile | null>(null)
  const [location, setLocation]           = useState<WorkLocation | null>(null)
  const [todayCheckIns, setTodayCheckIns] = useState<CheckIn[]>([])
  const [userCoords, setUserCoords]       = useState<{ lat: number; lng: number } | null>(null)
  const [distance, setDistance]           = useState<number | null>(null)
  const [geoStatus, setGeoStatus]         = useState<GeoStatus>('idle')
  const [checking, setChecking]           = useState(false)
  const [message, setMessage]             = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [dataLoading, setDataLoading]     = useState(true)

  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: prof }, { data: checkIns }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,role,active').eq('id', user.id).single(),
      supabase.from('check_ins')
        .select('id,type,timestamp,distance_meters,within_radius,work_location_id')
        .eq('worker_id', user.id)
        .gte('timestamp', `${todayISO()}T00:00:00`)
        .order('timestamp', { ascending: false })
        .limit(10),
    ])

    setProfile(prof as Profile)
    setTodayCheckIns((checkIns ?? []) as CheckIn[])

    const { data: loc } = await supabase.rpc('get_worker_location_for_date', {
      p_worker_id: user.id,
      p_date: todayISO(),
    })
    setLocation(loc?.[0] ?? null)
    setDataLoading(false)
  }, [supabase, router])

  useEffect(() => { loadData() }, [loadData])

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
      if (location) {
        setDistance(haversineDistance(coords.lat, coords.lng, location.latitude, location.longitude))
      }
      setGeoStatus('ok')
    } catch {
      setGeoStatus('error')
      setMessage({ text: 'No se pudo obtener tu ubicación. Activa el GPS.', type: 'err' })
    }
  }

  const nextType: 'in' | 'out' = todayCheckIns[0]?.type === 'in' ? 'out' : 'in'
  const withinRadius = distance !== null && location !== null && distance <= location.radius

  async function handleCheckIn() {
    if (!userCoords || !profile) return
    setChecking(true)
    setMessage(null)
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: nextType,
          latitude: userCoords.lat,
          longitude: userCoords.lng,
          work_location_id: location?.id ?? null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error al fichar')
      setMessage({
        text: nextType === 'in' ? '¡Entrada registrada!' : '¡Salida registrada!',
        type: 'ok',
      })
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

  const color = avatarColor(profile?.full_name ?? '')

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col max-w-md mx-auto">

      {/* ── Header ── */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 pt-12 pb-5 safe-top sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 size={15} className="text-zinc-950" strokeWidth={2} />
            </div>
            <div>
              <p className="text-zinc-500 text-xs">BUILT · Hola,</p>
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
              <p className="section-title mb-1.5">Obra de hoy</p>
              {location ? (
                <>
                  <h2 className="font-bold text-white text-lg leading-tight">{location.name}</h2>
                  {location.address && (
                    <p className="text-sm text-zinc-500 mt-0.5 truncate">{location.address}</p>
                  )}
                </>
              ) : (
                <p className="text-zinc-600 text-sm">No hay obra asignada para hoy</p>
              )}
            </div>
            {location && (
              <a
                href={mapsUrl(location.latitude, location.longitude, location.name)}
                target="_blank" rel="noopener noreferrer"
                className="ml-3 p-2.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white flex-shrink-0"
              >
                <MapPin size={18} />
              </a>
            )}
          </div>

          {location && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="badge-gray">Radio: {location.radius} m</span>
              {distance !== null && (
                <span className={withinRadius ? 'badge-green' : 'badge-red'}>
                  {withinRadius ? '✓ Dentro del radio' : `Fuera — ${distanceLabel(distance)}`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── GPS + Fichaje ── */}
        {location ? (
          <div className="space-y-3">
            {/* Botón GPS */}
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
                : geoStatus === 'ok'
                ? <Navigation size={18} />
                : <Navigation size={18} />
              }
              {geoStatus === 'ok'
                ? `Ubicación obtenida · ${distanceLabel(distance!)}`
                : geoStatus === 'loading'
                ? 'Obteniendo ubicación...'
                : 'Obtener mi ubicación GPS'
              }
            </button>

            {/* Aviso fuera de radio */}
            {geoStatus === 'ok' && !withinRadius && (
              <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3.5">
                <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-300">
                  Estás a <strong>{distanceLabel(distance!)}</strong> del punto de trabajo.
                  El radio es {location.radius} m. El fichaje se registrará como incidencia.
                </p>
              </div>
            )}

            {/* Botón fichar */}
            <button
              onClick={handleCheckIn}
              disabled={geoStatus !== 'ok' || checking}
              className={`w-full flex items-center justify-center gap-3 rounded-xl px-6 py-5 text-base font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed ${
                nextType === 'in'
                  ? 'bg-emerald-500 text-white hover:bg-emerald-400'
                  : 'bg-red-500 text-white hover:bg-red-400'
              }`}
            >
              {checking
                ? <Loader2 size={22} className="animate-spin" />
                : nextType === 'in'
                ? <CheckCircle2 size={22} />
                : <XCircle size={22} />
              }
              {checking ? 'Registrando...' : nextType === 'in' ? 'Registrar Entrada' : 'Registrar Salida'}
            </button>
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

        {/* ── Historial ── */}
        <Link
          href="/worker/history"
          className="card-hover flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            <Clock size={16} className="text-zinc-500" />
            <span className="text-sm font-medium text-zinc-400">Ver historial completo</span>
          </div>
          <ChevronRight size={16} className="text-zinc-600" />
        </Link>
      </main>
    </div>
  )
}
