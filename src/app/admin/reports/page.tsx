'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, todayISO, initials, avatarColor, distanceLabel } from '@/lib/utils'
import type { Profile, CheckIn } from '@/types'
import { Download, Calendar, Loader2, TrendingUp, Clock, Users, AlertTriangle, CalendarOff } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format, subDays } from 'date-fns'
import { cn } from '@/lib/utils'

interface AbsenceSummary {
  vacation: number
  personal_day: number
  sick_leave: number
  other: number
}

interface WorkerReport {
  profile: Pick<Profile, 'id' | 'full_name'>
  days_worked: number
  total_minutes: number
  check_ins: number
  check_outs: number
  incidents: number
  absences: AbsenceSummary
}

function isoToUtc(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return Date.UTC(y, m - 1, day)
}

function calcAbsenceDays(from: string, to: string, rangeFrom: string, rangeTo: string): number {
  // Intersección entre el rango del informe y los días de ausencia (UTC para evitar DST)
  const start = Math.max(isoToUtc(from), isoToUtc(rangeFrom))
  const end   = Math.min(isoToUtc(to),   isoToUtc(rangeTo))
  if (end < start) return 0
  return Math.round((end - start) / 86400000) + 1
}

export default function ReportsPage() {
  const supabase = createClient()

  const [dateFrom, setDateFrom] = useState(() => format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [dateTo, setDateTo]     = useState(todayISO())
  const [data, setData]         = useState<WorkerReport[]>([])
  const [loading, setLoading]   = useState(false)
  const [exporting, setExporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const [profilesRes, checkInsRes, absencesRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name').eq('role', 'worker').eq('active', true).order('full_name'),
      supabase.from('check_ins')
        .select('id, worker_id, type, timestamp, within_radius, distance_meters')
        .gte('timestamp', `${dateFrom}T00:00:00`)
        .lte('timestamp', `${dateTo}T23:59:59`)
        .order('timestamp', { ascending: true }),
      fetch(`/api/absences?status=approved&date_from=${dateFrom}&date_to=${dateTo}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }).then(r => r.json()),
    ])

    const profiles  = (profilesRes.data ?? []) as Pick<Profile, 'id' | 'full_name'>[]
    const checkIns  = (checkInsRes.data ?? []) as CheckIn[]
    const absences  = (absencesRes.data ?? []) as { worker_id: string; type: string; date_from: string; date_to: string }[]

    // Mapa trabajador → reporte
    const workerMap: Record<string, WorkerReport> = {}
    for (const p of profiles) {
      workerMap[p.id] = {
        profile: p,
        days_worked: 0,
        total_minutes: 0,
        check_ins: 0,
        check_outs: 0,
        incidents: 0,
        absences: { vacation: 0, personal_day: 0, sick_leave: 0, other: 0 },
      }
    }

    // Agregar datos de fichajes
    const byWorkerDay: Record<string, Record<string, CheckIn[]>> = {}
    for (const ci of checkIns) {
      if (!byWorkerDay[ci.worker_id]) byWorkerDay[ci.worker_id] = {}
      const day = ci.timestamp.slice(0, 10)
      if (!byWorkerDay[ci.worker_id][day]) byWorkerDay[ci.worker_id][day] = []
      byWorkerDay[ci.worker_id][day].push(ci)
    }

    for (const [workerId, dayMap] of Object.entries(byWorkerDay)) {
      const wr = workerMap[workerId]
      if (!wr) continue
      for (const cis of Object.values(dayMap)) {
        if (cis.some(c => c.type === 'in')) wr.days_worked++
        const entry = cis.find(c => c.type === 'in')
        const exit  = cis.find(c => c.type === 'out')
        if (entry && exit) {
          const diff = new Date(exit.timestamp).getTime() - new Date(entry.timestamp).getTime()
          if (diff > 0) wr.total_minutes += Math.floor(diff / 60000)
        }
        wr.check_ins  += cis.filter(c => c.type === 'in').length
        wr.check_outs += cis.filter(c => c.type === 'out').length
        wr.incidents  += cis.filter(c => !c.within_radius).length
      }
    }

    // Agregar datos de ausencias aprobadas dentro del rango
    for (const a of absences) {
      if (!workerMap[a.worker_id]) continue
      const days = calcAbsenceDays(a.date_from, a.date_to, dateFrom, dateTo)
      if (days <= 0) continue
      const key = a.type as keyof AbsenceSummary
      if (key in workerMap[a.worker_id].absences) {
        workerMap[a.worker_id].absences[key] += days
      }
    }

    setData(Object.values(workerMap).sort((a, b) => b.days_worked - a.days_worked))
    setLoading(false)
  }, [supabase, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  function formatHours(minutes: number): string {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  async function exportExcel() {
    setExporting(true)

    // Hoja 1: Resumen por trabajador
    const summaryData = data.map(wr => ({
      'Trabajador':        wr.profile.full_name,
      'Días trabajados':   wr.days_worked,
      'Horas totales':     formatHours(wr.total_minutes),
      'Vacaciones':        wr.absences.vacation,
      'Asuntos propios':   wr.absences.personal_day,
      'Bajas':             wr.absences.sick_leave,
      'Otras ausencias':   wr.absences.other,
      'Entradas':          wr.check_ins,
      'Salidas':           wr.check_outs,
      'Incidencias GPS':   wr.incidents,
    }))

    // Hoja 2: Fichajes detallados
    const { data: detail } = await supabase
      .from('check_ins')
      .select(`type, timestamp, within_radius, distance_meters, notes, manually_modified,
        worker:profiles!worker_id(full_name),
        work_location:work_locations(name),
        obra:obras(name)`)
      .gte('timestamp', `${dateFrom}T00:00:00`)
      .lte('timestamp', `${dateTo}T23:59:59`)
      .order('timestamp', { ascending: true })

    const detailData = ((detail ?? []) as unknown as (CheckIn & {
      worker: { full_name: string }
      work_location: { name: string } | null
      obra: { name: string } | null
    })[]).map(ci => ({
      'Trabajador':   ci.worker?.full_name ?? '',
      'Tipo':         ci.type === 'in' ? 'Entrada' : 'Salida',
      'Fecha y Hora': new Date(ci.timestamp).toLocaleString('es-ES'),
      'Obra':         ci.obra?.name ?? ci.work_location?.name ?? 'Sin obra',
      'Distancia':    ci.distance_meters != null ? distanceLabel(ci.distance_meters) : '-',
      'Dentro radio': ci.within_radius ? 'Sí' : 'No',
      'Modificado':   ci.manually_modified ? 'Sí' : 'No',
      'Notas':        ci.notes ?? '',
    }))

    // Hoja 3: Ausencias aprobadas del periodo
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const absRes = await fetch(`/api/absences?status=approved&date_from=${dateFrom}&date_to=${dateTo}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const absJson = await absRes.json()
    const absData = ((absJson.data ?? []) as (typeof absJson.data[0] & { worker: { full_name: string } })[]).map((a) => ({
      'Trabajador':  a.worker?.full_name ?? '',
      'Tipo':        a.type === 'vacation' ? 'Vacaciones' : a.type === 'personal_day' ? 'Asunto propio' : a.type === 'sick_leave' ? 'Baja' : 'Otro',
      'Desde':       a.date_from,
      'Hasta':       a.date_to,
      'Días':        calcAbsenceDays(a.date_from, a.date_to, dateFrom, dateTo),
      'Motivo':      a.reason ?? '',
    }))

    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(summaryData)
    const ws2 = XLSX.utils.json_to_sheet(detailData)
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')
    XLSX.utils.book_append_sheet(wb, ws2, 'Fichajes')
    if (absData.length > 0) {
      const ws3 = XLSX.utils.json_to_sheet(absData)
      ws3['!cols'] = Object.keys(absData[0] ?? {}).map(k => ({ wch: Math.max(k.length, 14) }))
      XLSX.utils.book_append_sheet(wb, ws3, 'Ausencias')
    }

    ws1['!cols'] = Object.keys(summaryData[0] ?? {}).map(k => ({ wch: Math.max(k.length, 14) }))
    ws2['!cols'] = Object.keys(detailData[0] ?? {}).map(k => ({ wch: Math.max(k.length, 14) }))

    XLSX.writeFile(wb, `FichaApp-informe-${dateFrom}_${dateTo}.xlsx`)
    setExporting(false)
  }

  const totalDays      = data.reduce((s, w) => s + w.days_worked, 0)
  const totalMinutes   = data.reduce((s, w) => s + w.total_minutes, 0)
  const totalIncidents = data.reduce((s, w) => s + w.incidents, 0)
  const totalAbsences  = data.reduce((s, w) =>
    s + w.absences.vacation + w.absences.personal_day + w.absences.sick_leave + w.absences.other, 0)

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Informes</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Resumen de actividad y ausencias por trabajador</p>
        </div>
        <button onClick={exportExcel} disabled={exporting || data.length === 0} className="btn-secondary gap-2">
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          Exportar Excel
        </button>
      </div>

      {/* ── Filtro fechas ── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Calendar size={15} className="text-zinc-500" />
          <span className="text-sm text-zinc-400">Desde</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input w-auto" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-400">Hasta</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input w-auto" />
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card">
          <Users size={16} className="text-zinc-600 mb-2" />
          <p className="text-2xl font-bold text-white">{data.filter(w => w.days_worked > 0).length}</p>
          <p className="text-xs text-zinc-500 mt-1">Trabajadores activos</p>
        </div>
        <div className="card">
          <TrendingUp size={16} className="text-zinc-600 mb-2" />
          <p className="text-2xl font-bold text-white">{totalDays}</p>
          <p className="text-xs text-zinc-500 mt-1">Jornadas trabajadas</p>
        </div>
        <div className="card">
          <Clock size={16} className="text-zinc-600 mb-2" />
          <p className="text-2xl font-bold text-white">{formatHours(totalMinutes)}</p>
          <p className="text-xs text-zinc-500 mt-1">Horas registradas</p>
        </div>
        <div className="card bg-amber-500/5 border-amber-500/15">
          <AlertTriangle size={16} className="text-amber-600 mb-2" />
          <p className="text-2xl font-bold text-amber-400">{totalIncidents}</p>
          <p className="text-xs text-zinc-500 mt-1">Incidencias GPS</p>
        </div>
      </div>

      {/* KPI ausencias */}
      {totalAbsences > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { key: 'vacation',    label: 'Vacaciones',    color: 'text-blue-400',   bg: 'bg-blue-500/5   border-blue-500/15' },
            { key: 'personal_day',label: 'As. propios',   color: 'text-purple-400', bg: 'bg-purple-500/5 border-purple-500/15' },
            { key: 'sick_leave',  label: 'Bajas',         color: 'text-amber-400',  bg: 'bg-amber-500/5  border-amber-500/15' },
            { key: 'other',       label: 'Otras',         color: 'text-zinc-400',   bg: 'bg-zinc-800/50' },
          ].map(({ key, label, color, bg }) => {
            const total = data.reduce((s, w) => s + w.absences[key as keyof AbsenceSummary], 0)
            return (
              <div key={key} className={cn('card', bg)}>
                <CalendarOff size={14} className={cn('mb-2', color)} />
                <p className={cn('text-2xl font-bold', color)}>{total}</p>
                <p className="text-xs text-zinc-500 mt-1">{label} · días</p>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tabla por trabajador ── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800">
            <p className="text-sm font-semibold text-zinc-300">
              Detalle por trabajador · {formatDate(dateFrom)} – {formatDate(dateTo)}
            </p>
          </div>

          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Trabajador</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Días trab.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Horas</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-blue-400/60 uppercase tracking-wider">Vac.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-purple-400/60 uppercase tracking-wider">As. prop.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-amber-400/60 uppercase tracking-wider">Bajas</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-zinc-600 uppercase tracking-wider">Otras aus.</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Incid.</th>
                </tr>
              </thead>
              <tbody>
                {data.map(wr => (
                  <tr key={wr.profile.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(avatarColor(wr.profile.full_name), 'w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0')}>
                          {initials(wr.profile.full_name)}
                        </div>
                        <span className="text-zinc-200 font-medium">{wr.profile.full_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      <span className={cn('font-semibold', wr.days_worked > 0 ? 'text-white' : 'text-zinc-600')}>
                        {wr.days_worked}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      <span className={cn('font-mono text-sm', wr.total_minutes > 0 ? 'text-zinc-300' : 'text-zinc-600')}>
                        {wr.total_minutes > 0 ? formatHours(wr.total_minutes) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {wr.absences.vacation > 0
                        ? <span className="font-semibold text-blue-300">{wr.absences.vacation}</span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {wr.absences.personal_day > 0
                        ? <span className="font-semibold text-purple-300">{wr.absences.personal_day}</span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {wr.absences.sick_leave > 0
                        ? <span className="font-semibold text-amber-300">{wr.absences.sick_leave}</span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {wr.absences.other > 0
                        ? <span className="font-semibold text-zinc-400">{wr.absences.other}</span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                    <td className="px-3 py-3.5 text-center">
                      {wr.incidents > 0
                        ? <span className="badge-orange">{wr.incidents}</span>
                        : <span className="text-zinc-700">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden divide-y divide-zinc-800">
            {data.map(wr => {
              const totalAbs = wr.absences.vacation + wr.absences.personal_day + wr.absences.sick_leave + wr.absences.other
              return (
                <div key={wr.profile.id} className="px-4 py-4 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className={cn(avatarColor(wr.profile.full_name), 'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0')}>
                      {initials(wr.profile.full_name)}
                    </div>
                    <span className="text-zinc-200 font-medium text-sm">{wr.profile.full_name}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span className="text-zinc-500">Días: <strong className="text-zinc-300">{wr.days_worked}</strong></span>
                    <span className="text-zinc-500">Horas: <strong className="text-zinc-300">{wr.total_minutes > 0 ? formatHours(wr.total_minutes) : '—'}</strong></span>
                    {wr.absences.vacation > 0    && <span className="text-blue-400/80">Vac: <strong>{wr.absences.vacation}d</strong></span>}
                    {wr.absences.personal_day > 0 && <span className="text-purple-400/80">As.prop: <strong>{wr.absences.personal_day}d</strong></span>}
                    {wr.absences.sick_leave > 0  && <span className="text-amber-400/80">Baja: <strong>{wr.absences.sick_leave}d</strong></span>}
                    {wr.incidents > 0            && <span className="badge-orange">{wr.incidents} incid.</span>}
                  </div>
                </div>
              )
            })}
          </div>

          {data.length === 0 && !loading && (
            <div className="text-center py-12 text-zinc-600">
              <TrendingUp size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Sin datos para el periodo seleccionado</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
