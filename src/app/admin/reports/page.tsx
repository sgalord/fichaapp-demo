'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, todayISO, calcHours, initials, avatarColor, distanceLabel } from '@/lib/utils'
import type { Profile, CheckIn } from '@/types'
import { Download, Calendar, Loader2, TrendingUp, Clock, Users, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format, subDays } from 'date-fns'

interface WorkerReport {
  profile: Pick<Profile, 'id' | 'full_name'>
  days_worked: number
  total_hours: number
  total_minutes: number
  check_ins: number
  check_outs: number
  incidents: number   // fichajes fuera del radio
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

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'worker')
      .eq('active', true)
      .order('full_name')

    const { data: checkIns } = await supabase
      .from('check_ins')
      .select('id, worker_id, type, timestamp, within_radius, distance_meters')
      .gte('timestamp', `${dateFrom}T00:00:00`)
      .lte('timestamp', `${dateTo}T23:59:59`)
      .order('timestamp', { ascending: true })

    // Agrupar por trabajador
    const workerMap: Record<string, WorkerReport> = {}
    for (const p of (profiles ?? []) as Pick<Profile, 'id' | 'full_name'>[]) {
      workerMap[p.id] = {
        profile: p,
        days_worked: 0,
        total_hours: 0,
        total_minutes: 0,
        check_ins: 0,
        check_outs: 0,
        incidents: 0,
      }
    }

    // Agrupar check-ins por trabajador + día
    const byWorkerDay: Record<string, Record<string, CheckIn[]>> = {}
    for (const ci of (checkIns ?? []) as CheckIn[]) {
      if (!byWorkerDay[ci.worker_id]) byWorkerDay[ci.worker_id] = {}
      const day = ci.timestamp.slice(0, 10)
      if (!byWorkerDay[ci.worker_id][day]) byWorkerDay[ci.worker_id][day] = []
      byWorkerDay[ci.worker_id][day].push(ci)
    }

    for (const [workerId, dayMap] of Object.entries(byWorkerDay)) {
      const wr = workerMap[workerId]
      if (!wr) continue

      for (const [, cis] of Object.entries(dayMap)) {
        const hasEntry = cis.some(c => c.type === 'in')
        if (hasEntry) wr.days_worked++

        const entry = cis.find(c => c.type === 'in')
        const exit  = cis.find(c => c.type === 'out')
        if (entry && exit) {
          const diff = new Date(exit.timestamp).getTime() - new Date(entry.timestamp).getTime()
          if (diff > 0) {
            wr.total_minutes += Math.floor(diff / 60000)
          }
        }

        wr.check_ins  += cis.filter(c => c.type === 'in').length
        wr.check_outs += cis.filter(c => c.type === 'out').length
        wr.incidents  += cis.filter(c => !c.within_radius).length
      }

      wr.total_hours = Math.floor(wr.total_minutes / 60)
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
      'Entradas':          wr.check_ins,
      'Salidas':           wr.check_outs,
      'Incidencias GPS':   wr.incidents,
    }))

    // Hoja 2: Fichajes detallados
    const { data: detail } = await supabase
      .from('check_ins')
      .select(`
        type, timestamp, within_radius, distance_meters, notes, manually_modified,
        worker:profiles!worker_id(full_name),
        work_location:work_locations(name)
      `)
      .gte('timestamp', `${dateFrom}T00:00:00`)
      .lte('timestamp', `${dateTo}T23:59:59`)
      .order('timestamp', { ascending: true })

    const detailData = ((detail ?? []) as unknown as (CheckIn & {
      worker: { full_name: string }
      work_location: { name: string } | null
    })[]).map(ci => ({
      'Trabajador':     ci.worker?.full_name ?? '',
      'Tipo':           ci.type === 'in' ? 'Entrada' : 'Salida',
      'Fecha y Hora':   new Date(ci.timestamp).toLocaleString('es-ES'),
      'Obra':           ci.work_location?.name ?? 'Sin obra',
      'Distancia':      ci.distance_meters != null ? distanceLabel(ci.distance_meters) : '-',
      'Dentro radio':   ci.within_radius ? 'Sí' : 'No',
      'Modificado':     ci.manually_modified ? 'Sí' : 'No',
      'Notas':          ci.notes ?? '',
    }))

    const wb = XLSX.utils.book_new()
    const ws1 = XLSX.utils.json_to_sheet(summaryData)
    const ws2 = XLSX.utils.json_to_sheet(detailData)
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen')
    XLSX.utils.book_append_sheet(wb, ws2, 'Detalle')

    ws1['!cols'] = Object.keys(summaryData[0] ?? {}).map(k => ({ wch: Math.max(k.length, 16) }))
    ws2['!cols'] = Object.keys(detailData[0] ?? {}).map(k => ({ wch: Math.max(k.length, 16) }))

    XLSX.writeFile(wb, `BUILT-informe-${dateFrom}_${dateTo}.xlsx`)
    setExporting(false)
  }

  const totalDays    = data.reduce((s, w) => s + w.days_worked, 0)
  const totalMinutes = data.reduce((s, w) => s + w.total_minutes, 0)
  const totalIncidents = data.reduce((s, w) => s + w.incidents, 0)

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Informes</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Resumen de actividad por trabajador</p>
        </div>
        <button
          onClick={exportExcel}
          disabled={exporting || data.length === 0}
          className="btn-secondary gap-2"
        >
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

      {/* ── KPIs del periodo ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card">
          <Users size={16} className="text-zinc-600 mb-2" />
          <p className="text-2xl font-bold text-white">{data.filter(w => w.days_worked > 0).length}</p>
          <p className="text-xs text-zinc-500 mt-1">Trabajadores activos</p>
        </div>
        <div className="card">
          <TrendingUp size={16} className="text-zinc-600 mb-2" />
          <p className="text-2xl font-bold text-white">{totalDays}</p>
          <p className="text-xs text-zinc-500 mt-1">Jornadas totales</p>
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

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Trabajador</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Días</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Horas</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Entradas</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Salidas</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Incidencias</th>
                </tr>
              </thead>
              <tbody>
                {data.map(wr => (
                  <tr key={wr.profile.id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`${avatarColor(wr.profile.full_name)} w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0`}>
                          {initials(wr.profile.full_name)}
                        </div>
                        <span className="text-zinc-200 font-medium">{wr.profile.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`font-semibold ${wr.days_worked > 0 ? 'text-white' : 'text-zinc-600'}`}>
                        {wr.days_worked}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span className={`font-mono text-sm ${wr.total_minutes > 0 ? 'text-zinc-300' : 'text-zinc-600'}`}>
                        {wr.total_minutes > 0 ? formatHours(wr.total_minutes) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-center text-zinc-400">{wr.check_ins}</td>
                    <td className="px-4 py-3.5 text-center text-zinc-400">{wr.check_outs}</td>
                    <td className="px-4 py-3.5 text-center">
                      {wr.incidents > 0
                        ? <span className="badge-orange">{wr.incidents}</span>
                        : <span className="text-zinc-700">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-zinc-800">
            {data.map(wr => (
              <div key={wr.profile.id} className="px-4 py-4 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className={`${avatarColor(wr.profile.full_name)} w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {initials(wr.profile.full_name)}
                  </div>
                  <span className="text-zinc-200 font-medium text-sm">{wr.profile.full_name}</span>
                </div>
                <div className="flex gap-3 text-sm">
                  <span className="text-zinc-500">Días: <strong className="text-zinc-300">{wr.days_worked}</strong></span>
                  <span className="text-zinc-500">Horas: <strong className="text-zinc-300">{wr.total_minutes > 0 ? formatHours(wr.total_minutes) : '—'}</strong></span>
                  {wr.incidents > 0 && <span className="badge-orange">{wr.incidents} incid.</span>}
                </div>
              </div>
            ))}
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
