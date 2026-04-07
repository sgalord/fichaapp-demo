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
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type GeoStatus = 'idle' | 'loading' | 'ok' | 'error'

export default function WorkerPage() {
  const supabase = createClient()
  const router = useRouter()

  const [profile, setProfile]         = useState<Profile | null>(null)
  const [location, setLocation]       = useState<WorkLocation | null>(null)
  const [todayCheckIns, setTodayCheckIns] = useState<CheckIn[]>([])
  const [userCoords, setUserCoords]   = useState<{ lat: number; lng: number } | null>(null)
  const [distance, setDistance]       = useState<number | null>(null)
  const [geoStatus, setGeoStatus]     = useState<GeoStatus>('idle')
  const [checking, setChecking]       = useState(false)
  const [message, setMessage]         = useState<{ text: string; type: 'ok' | 'err' } | null>(null)
  const [dataLoading, setDataLoading] = useState(true)

  // Cargar datos del usuario y ubicación del día
  const loadData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Cargar perfil y fichajes de hoy en paralelo
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

    // Obtener ubicación asignada usando la función RPC optimizada
    const { data: loc } = await supabase.rpc('get_worker_location_for_date', {
      p_worker_id: user.id,
      p_date: todayISO(),
    })
    setLocation(loc?.[0] ?? null)
    setDataLoading(false)
  }, [supabase, router])

  useEffect(() => { loadData() }, [loadData])

  // Obtener GPS del usuario
  function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Tu dispositivo no soporta geolocalización'))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      })
    })
  }

  async function locateMe() {
    setGeoStatus('loading')
    setMessage(null)
    try {
      const pos = await getPosition()
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setUserCoords(coords)
      if (location) {
        const d = haversineDistance(coords.lat, coords.lng, location.latitude, location.longitude)
        setDistance(d)
      }
      setGeoStatus('ok')
    } catch {
      setGeoStatus('error')
      setMessage({ text: 'No se pudo obtener tu ubicación. Activa el GPS.', type: 'err' })
    }
  }

  // Determinar si el siguiente fichaje es entrada o salida
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
        text: nextType === 'in'
          ? '¡Entrada registrada correctamente!'
          : '¡Salida registrada correctamente!',
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    )
  }

  const color = avatarColor(profile?.full_name ?? '')

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="bg-orange-500 px-4 pt-12 pb-6 safe-top">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`${color} w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm`}>
              {initials(profile?.full_name ?? '')}
            </div>
            <div>
              <p className="text-orange-100 text-xs">Buenos días,</p>
              <p className="text-white font-semibold text-sm leading-tight">
                {profile?.full_name}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="bg-white/20 p-2 rounded-xl text-white"
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>

        {/* Fecha de hoy */}
        <div className="mt-4 bg-white/20 rounded-2xl px-4 py-3 flex items-center gap-2">
          <Clock size={16} className="text-white" />
          <span className="text-white text-sm font-medium capitalize">
            {formatDate(new Date())}
          </span>
        </div>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4 pb-8">
        {/* Tarjeta ubicación */}
        <div className="card">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">
                Obra de hoy
              </p>
              {location ? (
                <>
                  <h2 className="font-bold text-gray-900 text-lg leading-tight">
                    {location.name}
                  </h2>
                  {location.address && (
                    <p className="text-sm text-gray-500 mt-0.5">{location.address}</p>
                  )}
                </>
              ) : (
                <p className="text-gray-400 text-sm">No hay obra asignada para hoy</p>
              )}
            </div>
            {location && (
              <a
                href={mapsUrl(location.latitude, location.longitude, location.name)}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-orange-50 text-orange-600 p-2 rounded-xl flex-shrink-0"
              >
                <MapPin size={20} />
              </a>
            )}
          </div>

          {location && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="badge-orange">Radio: {location.radius} m</span>
              {distance !== null && (
                <span className={withinRadius ? 'badge-green' : 'badge-red'}>
                  Tú: {distanceLabel(distance)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Botón GPS + Fichar */}
        {location ? (
          <div className="space-y-3">
            {/* Paso 1: Obtener ubicación */}
            <button
              onClick={locateMe}
              disabled={geoStatus === 'loading'}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              {geoStatus === 'loading' ? (
                <Loader2 size={20} className="animate-spin text-orange-500" />
              ) : geoStatus === 'ok' ? (
                <Navigation size={20} className="text-green-500" />
              ) : (
                <Navigation size={20} className="text-orange-500" />
              )}
              {geoStatus === 'ok'
                ? `Ubicación obtenida · ${distanceLabel(distance!)}`
                : geoStatus === 'loading'
                ? 'Obteniendo ubicación...'
                : 'Obtener mi ubicación'}
            </button>

            {/* Advertencia fuera de radio */}
            {geoStatus === 'ok' && !withinRadius && (
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <AlertTriangle size={18} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  Estás a <strong>{distanceLabel(distance!)}</strong> del punto de trabajo.
                  El radio máximo es {location.radius} m. El fichaje se registrará como incidencia.
                </p>
              </div>
            )}

            {/* Paso 2: Fichar */}
            <button
              onClick={handleCheckIn}
              disabled={geoStatus !== 'ok' || checking}
              className={`w-full flex items-center justify-center gap-3 rounded-2xl px-6 py-5 text-lg font-bold transition-all active:scale-95 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                nextType === 'in'
                  ? 'bg-green-500 text-white shadow-green-200'
                  : 'bg-red-500 text-white shadow-red-200'
              }`}
            >
              {checking ? (
                <Loader2 size={24} className="animate-spin" />
              ) : nextType === 'in' ? (
                <CheckCircle2 size={24} />
              ) : (
                <XCircle size={24} />
              )}
              {checking ? 'Registrando...' : nextType === 'in' ? 'Registrar Entrada' : 'Registrar Salida'}
            </button>
          </div>
        ) : (
          <div className="card flex items-center gap-3 border-dashed border-2 border-gray-200">
            <AlertTriangle size={20} className="text-amber-500" />
            <p className="text-sm text-gray-500">
              No tienes obra asignada hoy. Contacta con tu encargado.
            </p>
          </div>
        )}

        {/* Mensaje resultado */}
        {message && (
          <div className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
            message.type === 'ok'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-600 border border-red-200'
          }`}>
            {message.type === 'ok'
              ? <CheckCircle2 size={18} />
              : <AlertTriangle size={18} />}
            {message.text}
          </div>
        )}

        {/* Fichajes de hoy */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Fichajes de hoy</h3>
            <button onClick={loadData} className="text-gray-400 p-1">
              <RefreshCw size={16} />
            </button>
          </div>

          {todayCheckIns.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Sin fichajes hoy
            </p>
          ) : (
            <div className="space-y-2">
              {todayCheckIns.map((ci) => (
                <div key={ci.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={ci.type === 'in' ? 'badge-green' : 'badge-red'}>
                      {ci.type === 'in' ? 'Entrada' : 'Salida'}
                    </span>
                    {!ci.within_radius && (
                      <span className="badge-orange">Fuera radio</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-semibold text-gray-900">
                      {formatTime(ci.timestamp)}
                    </span>
                    {ci.distance_meters !== null && (
                      <p className="text-xs text-gray-400">{distanceLabel(ci.distance_meters)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Link historial */}
        <Link
          href="/worker/history"
          className="card flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-medium text-gray-700">Ver historial completo</span>
          <ChevronRight size={18} className="text-gray-400" />
        </Link>
      </main>
    </div>
  )
}
