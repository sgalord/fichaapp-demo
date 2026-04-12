'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatTime, formatDate, distanceLabel, todayISO, initials, avatarColor } from '@/lib/utils'
import type { CheckIn, DailySummary, Profile } from '@/types'
import {
  Users, CheckCircle2, Clock, XCircle, AlertTriangle,
  MapPin, RefreshCw, Loader2, ArrowRight, Bell, TrendingUp, CalendarOff, MessageSquare,
} from 'lucide-react'
import Link from 'next/link'

interface WorkerStatus {
  profile:     Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
  lastIn:      CheckIn | null
  lastOut:     CheckIn | null
  status:      'in' | 'out' | 'absent' | 'pending' | 'on_leave'
  absenceType?: string   // tipo de ausencia aprobada hoy (si aplica)
}

interface Notification {
  id: string
  name: string
  type: 'in' | 'out'
  time: Date
}

export default function AdminDashboard() {
  const supabase = createClient()

  const [summary, setSummary]         = useState<DailySummary | null>(null)
  const [workers, setWorkers]         = useState<WorkerStatus[]>([])
  const [loading, setLoading]         = useState(true)
  const [lastUpdate, setLastUpdate]   = useState<Date>(new Date())
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [showNotifs, setShowNotifs]   = useState(false)
  const [pendingAbsences, setPendingAbsences] = useState<{ id: string; worker: { full_name: string }; type: string; date_from: string; date_to: string }[]>([])
  const [unreadMessages, setUnreadMessages]   = useState(0)

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)

    const { data: sum } = await supabase.rpc('get_daily_summary', { p_date: todayISO() })

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('role', 'worker')
      .eq('active', true)
      .order('full_name')

    const { data: todayCheckIns } = await supabase
      .from('check_ins')
      .select('id, worker_id, type, timestamp, distance_meters, within_radius')
      .gte('timestamp', `${todayISO()}T00:00:00`)
      .order('timestamp', { ascending: false })

    const today = todayISO()
    const [obraRes, absenceRes, pendingRes, msgRes] = await Promise.all([
      fetch(`/api/obra-assignments?date=${today}`),
      fetch(`/api/absences?status=approved&overlap=true&date_from=${today}&date_to=${today}`),
      fetch(`/api/absences?status=pending`),
      fetch(`/api/messages`),
    ])
    const obraData    = obraRes.ok    ? (await obraRes.json()).data    ?? [] : []
    const absenceData = absenceRes.ok ? (await absenceRes.json()).data ?? [] : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pendingData = pendingRes.ok ? (await pendingRes.json()).data ?? [] : []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgData: any[] = msgRes.ok ? (await msgRes.json()).data ?? [] : []
    setPendingAbsences(pendingData)
    setUnreadMessages(msgData.reduce((acc: number, c: { unread_count?: number }) => acc + (c.unread_count ?? 0), 0))

    const withObraToday = new Set<string>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (obraData as any[]).map((a: any) => a.worker_id).filter(Boolean)
    )
    // Mapa worker_id → tipo de ausencia aprobada hoy
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const absenceToday = new Map<string, string>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (absenceData as any[]).map((a: any) => [a.worker_id, a.type])
    )

    const statusMap: Record<string, WorkerStatus> = {}
    for (const p of (profiles ?? []) as Pick<Profile, 'id' | 'full_name' | 'avatar_url'>[]) {
      statusMap[p.id] = { profile: p, lastIn: null, lastOut: null, status: 'pending' }
    }
    for (const ci of ((todayCheckIns ?? []) as CheckIn[])) {
      const ws = statusMap[ci.worker_id]
      if (!ws) continue
      if (ci.type === 'in'  && !ws.lastIn)  ws.lastIn  = ci
      if (ci.type === 'out' && !ws.lastOut) ws.lastOut = ci
    }
    for (const ws of Object.values(statusMap)) {
      if (ws.lastIn && ws.lastOut) {
        ws.status = 'out'
      } else if (ws.lastIn) {
        ws.status = 'in'
      } else if (absenceToday.has(ws.profile.id)) {
        ws.status      = 'on_leave'
        ws.absenceType = absenceToday.get(ws.profile.id)
      } else if (withObraToday.has(ws.profile.id)) {
        ws.status = 'absent'   // tiene obra asignada pero no ha fichado
      } else {
        ws.status = 'pending'  // sin obra ni ausencia → pendiente asignar
      }
    }

    setSummary(sum?.[0] ?? null)
    setWorkers(Object.values(statusMap))
    setLastUpdate(new Date())
    if (!silent) setLoading(false)
  }, [supabase])

  // Carga inicial
  useEffect(() => { loadDashboard() }, [loadDashboard])

  // Suscripción Realtime — notifica cuando alguien ficha
  useEffect(() => {
    const channel = supabase
      .channel('checkins-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'check_ins' },
        async (payload) => {
          const { data: prof } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', payload.new.worker_id)
            .single()

          const newNotif: Notification = {
            id: payload.new.id,
            name: prof?.full_name ?? 'Trabajador',
            type: payload.new.type as 'in' | 'out',
            time: new Date(),
          }
          setNotifications(prev => [newNotif, ...prev].slice(0, 20))
          loadDashboard(true)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, loadDashboard])

  // Suscripción Realtime — nuevas solicitudes de ausencia
  useEffect(() => {
    const channel = supabase
      .channel('absences-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'absences' }, () => {
        loadDashboard(true)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        loadDashboard(true)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, loadDashboard])

  const inWorkers      = workers.filter(w => w.status === 'in')
  const outWorkers     = workers.filter(w => w.status === 'out')
  const absentWorkers  = workers.filter(w => w.status === 'absent')
  const pendingWorkers = workers.filter(w => w.status === 'pending')
  const onLeaveWorkers = workers.filter(w => w.status === 'on_leave')

  const unreadCount = notifications.length

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-0.5 capitalize">{formatDate(new Date())}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Notificaciones */}
          <div className="relative">
            <button
              onClick={() => setShowNotifs(v => !v)}
              className="relative p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white transition-colors"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-white text-zinc-950 text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown notificaciones */}
            {showNotifs && (
              <div className="absolute right-0 top-12 w-80 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-up">
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
                  <span className="text-sm font-semibold text-white">Actividad reciente</span>
                  <button
                    onClick={() => setNotifications([])}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Limpiar
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <p className="text-sm text-zinc-600 text-center py-6">Sin actividad reciente</p>
                  ) : (
                    notifications.map(n => (
                      <div key={n.id} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800/50 last:border-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${n.type === 'in' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 truncate">{n.name}</p>
                          <p className="text-xs text-zinc-500">
                            {n.type === 'in' ? 'Entrada' : 'Salida'} · {formatTime(n.time)}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => loadDashboard()}
            disabled={loading}
            className="p-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Total trabajadores" value={summary?.total_workers ?? workers.length} icon={Users} color="zinc" />
        <KpiCard label="En obra ahora"      value={inWorkers.length}     icon={CheckCircle2} color="emerald" />
        <KpiCard label="Han salido"         value={outWorkers.length}    icon={TrendingUp}   color="blue" />
        <KpiCard label="Sin fichar"         value={absentWorkers.length} icon={XCircle}      color="red" />
      </div>

      {loading && workers.length === 0 && (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-zinc-400 animate-spin" />
        </div>
      )}

      {/* ── En obra ── */}
      {inWorkers.length > 0 && (
        <section className="space-y-2">
          <p className="section-title flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            En obra ({inWorkers.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {inWorkers.map(({ profile, lastIn }) => (
              <WorkerRow key={profile.id} profile={profile}
                statusLabel="Entrada" badgeClass="badge-green"
                time={lastIn?.timestamp} distance={lastIn?.distance_meters} withinRadius={lastIn?.within_radius ?? true}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Han salido ── */}
      {outWorkers.length > 0 && (
        <section className="space-y-2">
          <p className="section-title">Han salido ({outWorkers.length})</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {outWorkers.map(({ profile, lastOut }) => (
              <WorkerRow key={profile.id} profile={profile}
                statusLabel="Salida" badgeClass="badge-gray"
                time={lastOut?.timestamp} distance={lastOut?.distance_meters} withinRadius={lastOut?.within_radius ?? true}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Sin fichar ── */}
      {absentWorkers.length > 0 && (
        <section className="space-y-2">
          <p className="section-title flex items-center gap-1.5 text-red-400">
            <AlertTriangle size={12} />
            Sin fichar ({absentWorkers.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {absentWorkers.map(({ profile }) => (
              <div key={profile.id} className="card flex items-center gap-3">
                <Avatar name={profile.full_name} avatarUrl={profile.avatar_url} />
                <span className="text-sm font-medium text-zinc-300 flex-1 truncate">{profile.full_name}</span>
                <span className="badge-red">Ausente</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── De vacaciones / ausencia aprobada ── */}
      {onLeaveWorkers.length > 0 && (
        <section className="space-y-2">
          <p className="section-title flex items-center gap-1.5 text-blue-400">
            <CalendarOff size={12} />
            De vacaciones / ausencia ({onLeaveWorkers.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {onLeaveWorkers.map(({ profile, absenceType }) => (
              <div key={profile.id} className="card flex items-center gap-3 bg-blue-500/5 border-blue-500/15">
                <Avatar name={profile.full_name} avatarUrl={profile.avatar_url} />
                <span className="text-sm font-medium text-zinc-300 flex-1 truncate">{profile.full_name}</span>
                <span className="badge-blue">
                  {absenceType === 'vacation'    && 'Vacaciones'}
                  {absenceType === 'personal_day' && 'As. propio'}
                  {absenceType === 'sick_leave'  && 'Baja'}
                  {absenceType === 'other'       && 'Ausente'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Pendiente asignar obra ── */}
      {pendingWorkers.length > 0 && (
        <section className="space-y-2">
          <p className="section-title flex items-center gap-1.5 text-amber-400">
            <AlertTriangle size={12} />
            Pendiente asignar obra ({pendingWorkers.length})
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {pendingWorkers.map(({ profile }) => (
              <div key={profile.id} className="card flex items-center gap-3 bg-amber-500/5 border-amber-500/15">
                <Avatar name={profile.full_name} avatarUrl={profile.avatar_url} />
                <span className="text-sm font-medium text-zinc-300 flex-1 truncate">{profile.full_name}</span>
                <span className="badge-orange">Sin asignar</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Solicitudes de ausencia pendientes ── */}
      {pendingAbsences.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="section-title flex items-center gap-1.5 text-amber-400">
              <CalendarOff size={12} />
              Solicitudes pendientes ({pendingAbsences.length})
            </p>
            <Link href="/admin/ausencias" className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
              Ver todas <ArrowRight size={11} />
            </Link>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {pendingAbsences.slice(0, 4).map((a) => (
              <Link key={a.id} href="/admin/ausencias"
                className="card flex items-center gap-3 bg-amber-500/5 border-amber-500/15 hover:bg-amber-500/10 transition-colors">
                <Avatar name={a.worker?.full_name ?? '?'} avatarUrl={null} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">{a.worker?.full_name ?? '—'}</p>
                  <p className="text-xs text-zinc-500">
                    {a.type === 'vacation' && 'Vacaciones'}
                    {a.type === 'personal_day' && 'As. propio'}
                    {a.type === 'sick_leave' && 'Baja'}
                    {a.type === 'other' && 'Otro'}
                    {' · '}{formatDate(a.date_from)}
                    {a.date_from !== a.date_to && ` → ${formatDate(a.date_to)}`}
                  </p>
                </div>
                <span className="badge-orange flex-shrink-0"><Clock size={10} />Pendiente</span>
              </Link>
            ))}
          </div>
          {pendingAbsences.length > 4 && (
            <Link href="/admin/ausencias" className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 justify-center py-1">
              +{pendingAbsences.length - 4} más <ArrowRight size={11} />
            </Link>
          )}
        </section>
      )}

      {/* ── Timestamp ── */}
      <p className="text-center text-xs text-zinc-700">
        Actualizado {formatTime(lastUpdate)}
      </p>

      {/* ── Accesos rápidos ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <Link href="/admin/locations" className="card-hover flex flex-col gap-3">
          <MapPin size={20} className="text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">Gestionar ubicaciones</span>
          <ArrowRight size={14} className="text-zinc-600 self-end mt-auto" />
        </Link>
        <Link href="/admin/checkins" className="card-hover flex flex-col gap-3">
          <Clock size={20} className="text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">Ver todos los fichajes</span>
          <ArrowRight size={14} className="text-zinc-600 self-end mt-auto" />
        </Link>
        <Link href="/admin/reports" className="card-hover flex flex-col gap-3 col-span-2 lg:col-span-1">
          <TrendingUp size={20} className="text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">Informes y exportación</span>
          <ArrowRight size={14} className="text-zinc-600 self-end mt-auto" />
        </Link>
        <Link href="/admin/mensajes" className="card-hover flex flex-col gap-3 relative">
          <MessageSquare size={20} className="text-blue-400" />
          {unreadMessages > 0 && (
            <span className="absolute top-3 left-8 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {unreadMessages > 9 ? '9+' : unreadMessages}
            </span>
          )}
          <span className="text-sm font-medium text-zinc-300">Mensajes</span>
          <ArrowRight size={14} className="text-zinc-600 self-end mt-auto" />
        </Link>
      </div>
    </div>
  )
}

// ── Sub-components ──

function Avatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatarUrl} alt={name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
  }
  const colors = ['bg-violet-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-cyan-500']
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff
  const color = colors[Math.abs(hash) % colors.length]
  const ini = name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('')
  return (
    <div className={`${color} w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
      {ini}
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, color }: {
  label: string
  value: number
  icon: React.ElementType
  color: 'zinc' | 'emerald' | 'blue' | 'red'
}) {
  const colors = {
    zinc:    { bg: 'bg-zinc-900',           border: 'border-zinc-800',    text: 'text-white',        icon: 'text-zinc-500' },
    emerald: { bg: 'bg-emerald-500/10',     border: 'border-emerald-500/20', text: 'text-emerald-400', icon: 'text-emerald-500' },
    blue:    { bg: 'bg-blue-500/10',        border: 'border-blue-500/20',  text: 'text-blue-400',     icon: 'text-blue-500' },
    red:     { bg: 'bg-red-500/10',         border: 'border-red-500/20',   text: 'text-red-400',      icon: 'text-red-500' },
  }
  const c = colors[color]
  return (
    <div className={`${c.bg} border ${c.border} rounded-xl p-4`}>
      <p className="text-xs text-zinc-500 mb-2">{label}</p>
      <p className={`text-3xl font-bold ${c.text}`}>{value}</p>
      <Icon size={16} className={`${c.icon} mt-2`} />
    </div>
  )
}

function WorkerRow({
  profile, statusLabel, badgeClass, time, distance, withinRadius,
}: {
  profile: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
  statusLabel: string
  badgeClass: string
  time?: string
  distance?: number | null
  withinRadius?: boolean
}) {
  return (
    <div className="card flex items-center gap-3">
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatar_url} alt={profile.full_name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className={`${avatarColor(profile.full_name)} w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
          {initials(profile.full_name)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200 truncate">{profile.full_name}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={badgeClass}>{statusLabel}</span>
          {!withinRadius && <span className="badge-orange text-[10px]"><AlertTriangle size={8} />Radio</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        {time && <p className="text-sm font-semibold text-zinc-200">{formatTime(time)}</p>}
        {distance != null && (
          <p className="text-xs text-zinc-600 flex items-center gap-0.5 justify-end">
            <MapPin size={9} />{distanceLabel(distance)}
          </p>
        )}
      </div>
    </div>
  )
}
