'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime, formatDate, distanceLabel, todayISO, initials, avatarColor } from '@/lib/utils'
import type { CheckIn, DailySummary, Profile } from '@/types'
import {
  Users, CheckCircle2, Clock, XCircle, AlertTriangle,
  MapPin, RefreshCw, Loader2, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

interface WorkerStatus {
  profile: Pick<Profile, 'id' | 'full_name'>
  lastIn:  CheckIn | null
  lastOut: CheckIn | null
  status:  'in' | 'out' | 'absent'
}

export default function AdminDashboard() {
  const supabase = createClient()

  const [summary, setSummary]       = useState<DailySummary | null>(null)
  const [workers, setWorkers]       = useState<WorkerStatus[]>([])
  const [loading, setLoading]       = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  async function loadDashboard() {
    setLoading(true)

    // Resumen diario (función RPC optimizada)
    const { data: sum } = await supabase.rpc('get_daily_summary', { p_date: todayISO() })

    // Obtener trabajadores activos y sus fichajes de hoy
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'worker')
      .eq('active', true)
      .order('full_name')

    const { data: todayCheckIns } = await supabase
      .from('check_ins')
      .select('id, worker_id, type, timestamp, distance_meters, within_radius')
      .gte('timestamp', `${todayISO()}T00:00:00`)
      .order('timestamp', { ascending: false })

    // Construir estado por trabajador
    const statusMap: Record<string, WorkerStatus> = {}
    for (const p of (profiles ?? []) as Pick<Profile, 'id' | 'full_name'>[]) {
      statusMap[p.id] = { profile: p, lastIn: null, lastOut: null, status: 'absent' }
    }
    for (const ci of ((todayCheckIns ?? []) as CheckIn[])) {
      const ws = statusMap[ci.worker_id]
      if (!ws) continue
      if (ci.type === 'in'  && !ws.lastIn)  ws.lastIn  = ci
      if (ci.type === 'out' && !ws.lastOut) ws.lastOut = ci
    }
    // Determinar estado final
    for (const ws of Object.values(statusMap)) {
      if (ws.lastIn && ws.lastOut) ws.status = 'out'
      else if (ws.lastIn)         ws.status = 'in'
    }

    setSummary(sum?.[0] ?? null)
    setWorkers(Object.values(statusMap))
    setLastUpdate(new Date())
    setLoading(false)
  }

  useEffect(() => { loadDashboard() }, []) // eslint-disable-line

  const inWorkers     = workers.filter(w => w.status === 'in')
  const outWorkers    = workers.filter(w => w.status === 'out')
  const absentWorkers = workers.filter(w => w.status === 'absent')

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-xs text-gray-400 capitalize mt-0.5">{formatDate(new Date())}</p>
        </div>
        <button
          onClick={loadDashboard}
          disabled={loading}
          className="bg-white border border-gray-200 p-2.5 rounded-xl text-gray-500"
        >
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <p className="text-xs text-gray-500 mb-1">Total trabajadores</p>
            <p className="text-3xl font-bold text-gray-900">{summary.total_workers}</p>
            <Users size={16} className="text-gray-300 mt-1" />
          </div>
          <div className="card bg-green-50 border-green-100">
            <p className="text-xs text-green-600 mb-1">En obra ahora</p>
            <p className="text-3xl font-bold text-green-700">{inWorkers.length}</p>
            <CheckCircle2 size={16} className="text-green-300 mt-1" />
          </div>
          <div className="card bg-blue-50 border-blue-100">
            <p className="text-xs text-blue-600 mb-1">Han salido</p>
            <p className="text-3xl font-bold text-blue-700">{outWorkers.length}</p>
            <Clock size={16} className="text-blue-300 mt-1" />
          </div>
          <div className="card bg-red-50 border-red-100">
            <p className="text-xs text-red-500 mb-1">Sin fichar</p>
            <p className="text-3xl font-bold text-red-600">{absentWorkers.length}</p>
            <XCircle size={16} className="text-red-300 mt-1" />
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        </div>
      )}

      {/* En obra */}
      {inWorkers.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            En obra ({inWorkers.length})
          </h2>
          <div className="space-y-2">
            {inWorkers.map(({ profile, lastIn }) => (
              <WorkerRow
                key={profile.id}
                profile={profile}
                statusLabel="Entrada"
                badgeClass="badge-green"
                time={lastIn?.timestamp}
                distance={lastIn?.distance_meters}
                withinRadius={lastIn?.within_radius ?? true}
              />
            ))}
          </div>
        </section>
      )}

      {/* Han salido */}
      {outWorkers.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Han salido ({outWorkers.length})
          </h2>
          <div className="space-y-2">
            {outWorkers.map(({ profile, lastOut }) => (
              <WorkerRow
                key={profile.id}
                profile={profile}
                statusLabel="Salida"
                badgeClass="badge-gray"
                time={lastOut?.timestamp}
                distance={lastOut?.distance_meters}
                withinRadius={lastOut?.within_radius ?? true}
              />
            ))}
          </div>
        </section>
      )}

      {/* Sin fichar */}
      {absentWorkers.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1">
            <AlertTriangle size={14} />
            Sin fichar ({absentWorkers.length})
          </h2>
          <div className="space-y-2">
            {absentWorkers.map(({ profile }) => (
              <div key={profile.id} className="card flex items-center gap-3">
                <div className={`${avatarColor(profile.full_name)} w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                  {initials(profile.full_name)}
                </div>
                <span className="text-sm font-medium text-gray-700 flex-1">{profile.full_name}</span>
                <span className="badge-red">Ausente</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Actualización */}
      <p className="text-center text-xs text-gray-300">
        Actualizado: {formatTime(lastUpdate)}
      </p>

      {/* Acceso rápido */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/admin/locations" className="card flex flex-col gap-2 hover:bg-orange-50 transition-colors">
          <MapPin size={20} className="text-orange-500" />
          <span className="text-sm font-medium text-gray-700">Gestionar ubicaciones</span>
          <ArrowRight size={14} className="text-gray-400 self-end" />
        </Link>
        <Link href="/admin/checkins" className="card flex flex-col gap-2 hover:bg-orange-50 transition-colors">
          <Clock size={20} className="text-orange-500" />
          <span className="text-sm font-medium text-gray-700">Ver todos los fichajes</span>
          <ArrowRight size={14} className="text-gray-400 self-end" />
        </Link>
      </div>
    </div>
  )
}

function WorkerRow({
  profile, statusLabel, badgeClass, time, distance, withinRadius,
}: {
  profile: Pick<Profile, 'id' | 'full_name'>
  statusLabel: string
  badgeClass: string
  time?: string
  distance?: number | null
  withinRadius?: boolean
}) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`${avatarColor(profile.full_name)} w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
        {initials(profile.full_name)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{profile.full_name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={badgeClass}>{statusLabel}</span>
          {!withinRadius && <span className="badge-orange flex items-center gap-0.5"><AlertTriangle size={9} />Fuera radio</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        {time && <p className="text-sm font-semibold text-gray-900">{formatTime(time)}</p>}
        {distance != null && (
          <p className="text-xs text-gray-400 flex items-center gap-0.5 justify-end">
            <MapPin size={10} />{distanceLabel(distance)}
          </p>
        )}
      </div>
    </div>
  )
}
