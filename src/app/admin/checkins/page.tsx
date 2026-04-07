'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, formatDate, distanceLabel, todayISO, initials, avatarColor } from '@/lib/utils'
import type { CheckIn, Profile, WorkLocation } from '@/types'
import {
  Search, Calendar, Edit2, Loader2, X,
  CheckCircle2, XCircle, AlertTriangle, Clock, Download, ShieldAlert,
} from 'lucide-react'
import * as XLSX from 'xlsx'

type CheckInRow = Omit<CheckIn, 'worker' | 'work_location'> & {
  worker: Pick<Profile, 'id' | 'full_name'>
  work_location: Pick<WorkLocation, 'id' | 'name'> | null
  photo_url?: string | null
  device_fingerprint?: string | null
}

const PAGE_SIZE = 50 // más alto para detectar bien los duplicados

export default function CheckinsPage() {
  const supabase = createClient()

  const [rows, setRows]             = useState<CheckInRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(0)
  const [hasMore, setHasMore]       = useState(true)
  const [dateFilter, setDateFilter] = useState(todayISO())
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all')
  const [workerFilter, setWorkerFilter] = useState('')
  const [fraudOnly, setFraudOnly]   = useState(false)
  const [editing, setEditing]       = useState<CheckInRow | null>(null)
  const [editForm, setEditForm]     = useState({ timestamp: '', notes: '', type: 'in' as 'in' | 'out' })
  const [saving, setSaving]         = useState(false)
  const [exporting, setExporting]   = useState(false)

  const load = useCallback(async (pageNum: number, reset = false) => {
    setLoading(true)
    let q = supabase
      .from('check_ins')
      .select(`
        id, worker_id, work_location_id, type, latitude, longitude,
        distance_meters, within_radius, notes, manually_modified, timestamp,
        photo_url, device_fingerprint,
        worker:profiles!worker_id(id, full_name),
        work_location:work_locations(id, name)
      `)
      .gte('timestamp', `${dateFilter}T00:00:00`)
      .lte('timestamp', `${dateFilter}T23:59:59`)
      .order('timestamp', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    if (typeFilter !== 'all') q = q.eq('type', typeFilter)

    const { data } = await q

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filtered = workerFilter
      ? (data ?? []).filter(ci =>
          (ci as any).worker?.full_name?.toLowerCase().includes(workerFilter.toLowerCase())
        )
      : (data ?? [])

    if (!data || data.length < PAGE_SIZE) setHasMore(false)

    setRows(prev =>
      reset || pageNum === 0
        ? filtered as unknown as CheckInRow[]
        : [...prev, ...filtered as unknown as CheckInRow[]]
    )
    setLoading(false)
  }, [supabase, dateFilter, typeFilter, workerFilter])

  useEffect(() => {
    setPage(0)
    setHasMore(true)
    load(0, true)
  }, [dateFilter, typeFilter]) // eslint-disable-line

  // ── Detección de fraude ──────────────────────────────────────────────────
  // Fingerprints que aparecen asociados a MÁS DE UN trabajador diferente
  const suspiciousFps = useMemo(() => {
    const fpWorkers = new Map<string, Set<string>>() // fp → Set<worker_id>
    for (const ci of rows) {
      if (!ci.device_fingerprint) continue
      if (!fpWorkers.has(ci.device_fingerprint)) {
        fpWorkers.set(ci.device_fingerprint, new Set())
      }
      fpWorkers.get(ci.device_fingerprint)!.add(ci.worker_id)
    }
    // Solo los que tienen ≥2 trabajadores distintos
    const suspicious = new Set<string>()
    fpWorkers.forEach((workers, fp) => {
      if (workers.size >= 2) suspicious.add(fp)
    })
    return suspicious
  }, [rows])

  // Detalles de quiénes comparten dispositivo (para el tooltip/alerta)
  const fpWorkersMap = useMemo(() => {
    const map = new Map<string, string[]>() // fp → nombres
    for (const ci of rows) {
      if (!ci.device_fingerprint || !suspiciousFps.has(ci.device_fingerprint)) continue
      if (!map.has(ci.device_fingerprint)) map.set(ci.device_fingerprint, [])
      const name = ci.worker?.full_name ?? 'Desconocido'
      if (!map.get(ci.device_fingerprint)!.includes(name)) {
        map.get(ci.device_fingerprint)!.push(name)
      }
    }
    return map
  }, [rows, suspiciousFps])

  const fraudCount = useMemo(
    () => rows.filter(ci => ci.device_fingerprint && suspiciousFps.has(ci.device_fingerprint)).length,
    [rows, suspiciousFps],
  )

  const displayRows = useMemo(
    () => fraudOnly
      ? rows.filter(ci => ci.device_fingerprint && suspiciousFps.has(ci.device_fingerprint))
      : rows,
    [rows, fraudOnly, suspiciousFps],
  )

  // ── Edición ──────────────────────────────────────────────────────────────
  function openEdit(ci: CheckInRow) {
    setEditing(ci)
    setEditForm({
      timestamp: ci.timestamp.slice(0, 16),
      notes: ci.notes ?? '',
      type: ci.type,
    })
  }

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    const res = await fetch(`/api/checkins/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    })
    if (res.ok) {
      setEditing(null)
      load(0, true)
    }
    setSaving(false)
  }

  // ── Exportar Excel ───────────────────────────────────────────────────────
  async function exportExcel() {
    setExporting(true)
    let q = supabase
      .from('check_ins')
      .select(`
        id, type, timestamp, distance_meters, within_radius, notes, manually_modified, device_fingerprint,
        worker:profiles!worker_id(id, full_name),
        work_location:work_locations(id, name)
      `)
      .gte('timestamp', `${dateFilter}T00:00:00`)
      .lte('timestamp', `${dateFilter}T23:59:59`)
      .order('timestamp', { ascending: false })

    if (typeFilter !== 'all') q = q.eq('type', typeFilter)
    const { data } = await q

    const allForExport = (data ?? []) as unknown as CheckInRow[]

    // Recalcular fraudulentos para el Excel completo
    const fpW = new Map<string, Set<string>>()
    for (const ci of allForExport) {
      if (!ci.device_fingerprint) continue
      if (!fpW.has(ci.device_fingerprint)) fpW.set(ci.device_fingerprint, new Set())
      fpW.get(ci.device_fingerprint)!.add(ci.worker_id)
    }
    const suspEx = new Set([...fpW.entries()].filter(([,w]) => w.size >= 2).map(([fp]) => fp))

    const exportData = allForExport.map(ci => ({
      'Trabajador':        ci.worker?.full_name ?? '',
      'Tipo':              ci.type === 'in' ? 'Entrada' : 'Salida',
      'Fecha y Hora':      formatDateTime(ci.timestamp),
      'Obra':              ci.work_location?.name ?? 'Sin obra',
      'Distancia':         ci.distance_meters != null ? distanceLabel(ci.distance_meters) : '-',
      'Dentro del radio':  ci.within_radius ? 'Sí' : 'No',
      'Modificado':        ci.manually_modified ? 'Sí' : 'No',
      'Notas':             ci.notes ?? '',
      '⚠️ Posible fraude': ci.device_fingerprint && suspEx.has(ci.device_fingerprint) ? 'SÍ' : 'No',
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fichajes')
    const cols = Object.keys(exportData[0] ?? {}).map(k => ({ wch: Math.max(k.length, 15) }))
    ws['!cols'] = cols
    XLSX.writeFile(wb, `BUILT-fichajes-${dateFilter}.xlsx`)
    setExporting(false)
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fichajes</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Registro completo de entradas y salidas</p>
        </div>
        <button
          onClick={exportExcel}
          disabled={exporting || rows.length === 0}
          className="btn-secondary gap-2 text-sm"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          Exportar Excel
        </button>
      </div>

      {/* ── Alerta de fraude ── */}
      {fraudCount > 0 && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3.5">
          <ShieldAlert size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-300">
              ⚠️ Posible fraude detectado — {suspiciousFps.size} dispositivo{suspiciousFps.size > 1 ? 's' : ''} compartido{suspiciousFps.size > 1 ? 's' : ''}
            </p>
            <div className="mt-1 space-y-0.5">
              {[...fpWorkersMap.values()].map((names, i) => (
                <p key={i} className="text-xs text-red-400/80">
                  Mismo dispositivo: <span className="font-medium text-red-300">{names.join(' · ')}</span>
                </p>
              ))}
            </div>
          </div>
          <button
            onClick={() => setFraudOnly(v => !v)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors flex-shrink-0 ${
              fraudOnly
                ? 'bg-red-500 text-white'
                : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
            }`}
          >
            {fraudOnly ? 'Ver todos' : 'Ver solo fraudes'}
          </button>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-zinc-500 flex-shrink-0" />
          <input
            type="date"
            value={dateFilter}
            onChange={e => { setDateFilter(e.target.value); setPage(0); setFraudOnly(false) }}
            className="input flex-1"
          />
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="search"
              value={workerFilter}
              onChange={e => setWorkerFilter(e.target.value)}
              placeholder="Buscar trabajador..."
              className="input pl-9 text-sm"
            />
          </div>
          <div className="flex rounded-xl border border-zinc-700 overflow-hidden">
            {(['all', 'in', 'out'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  typeFilter === t
                    ? 'bg-white text-zinc-950'
                    : 'text-zinc-500 bg-zinc-800 hover:bg-zinc-700'
                }`}
              >
                {t === 'all' ? 'Todos' : t === 'in' ? 'Entradas' : 'Salidas'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Lista ── */}
      {loading && rows.length === 0 ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-14 text-zinc-600">
          <Clock size={36} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Sin fichajes para esta fecha</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayRows.map(ci => {
            const isFraud = !!ci.device_fingerprint && suspiciousFps.has(ci.device_fingerprint)
            const sharedWith = isFraud ? fpWorkersMap.get(ci.device_fingerprint!)?.filter(n => n !== ci.worker?.full_name) : []

            return (
              <div
                key={ci.id}
                className={`card ${isFraud ? 'border-red-500/30 bg-red-500/5' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`${avatarColor(ci.worker?.full_name ?? '')} w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {initials(ci.worker?.full_name ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-200 text-sm truncate">
                      {ci.worker?.full_name ?? 'Trabajador'}
                    </p>
                    {ci.work_location && (
                      <p className="text-xs text-zinc-600 truncate mt-0.5">{ci.work_location.name}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={ci.type === 'in' ? 'badge-green' : 'badge-red'}>
                        {ci.type === 'in' ? 'Entrada' : 'Salida'}
                      </span>
                      {!ci.within_radius && (
                        <span className="badge-orange">
                          <AlertTriangle size={9} />Fuera radio
                        </span>
                      )}
                      {ci.manually_modified && <span className="badge-gray">Modificado</span>}
                      {ci.distance_meters != null && (
                        <span className="badge-gray">{distanceLabel(ci.distance_meters)}</span>
                      )}
                      {isFraud && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                          <ShieldAlert size={9} />
                          Mismo dispositivo
                        </span>
                      )}
                    </div>

                    {/* Alerta de fraude con nombres */}
                    {isFraud && sharedWith && sharedWith.length > 0 && (
                      <div className="mt-2 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-2">
                        <ShieldAlert size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-300">
                          Dispositivo compartido con:{' '}
                          <span className="font-semibold">{sharedWith.join(', ')}</span>
                        </p>
                      </div>
                    )}

                    {ci.notes && (
                      <p className="text-xs text-amber-400/80 mt-1.5 bg-amber-500/10 rounded-lg px-2.5 py-1.5">
                        Nota: {ci.notes}
                      </p>
                    )}
                    {ci.photo_url && (
                      <a
                        href={ci.photo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 block rounded-xl overflow-hidden border border-zinc-700 hover:border-zinc-500 transition-colors"
                        title="Ver foto completa"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={ci.photo_url}
                          alt="Foto del fichaje"
                          className="w-full h-28 object-cover"
                        />
                      </a>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-zinc-200">{formatDateTime(ci.timestamp)}</p>
                    <button
                      onClick={() => openEdit(ci)}
                      className="mt-1.5 p-1.5 text-zinc-600 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
                    >
                      <Edit2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {hasMore && !fraudOnly && (
            <button
              onClick={() => { const next = page + 1; setPage(next); load(next) }}
              disabled={loading}
              className="btn-secondary w-full gap-2"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : null}
              Cargar más
            </button>
          )}
        </div>
      )}

      {/* ── Modal editar ── */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="font-semibold text-white">Editar fichaje</h2>
              <button onClick={() => setEditing(null)} className="text-zinc-500 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div className="bg-zinc-800 rounded-xl px-4 py-3">
                <p className="text-sm font-medium text-zinc-200">{editing.worker?.full_name}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{formatDate(editing.timestamp)}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-2 block">Tipo</label>
                <div className="flex gap-2">
                  {(['in', 'out'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditForm(f => ({ ...f, type: t }))}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all ${
                        editForm.type === t
                          ? t === 'in'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-red-500 text-white'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      {t === 'in' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      {t === 'in' ? 'Entrada' : 'Salida'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Fecha y hora</label>
                <input
                  type="datetime-local"
                  className="input"
                  value={editForm.timestamp}
                  onChange={e => setEditForm(f => ({ ...f, timestamp: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Notas (motivo de modificación)</label>
                <textarea
                  className="input min-h-[80px] resize-none"
                  value={editForm.notes}
                  onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ej: Corrección manual por error de GPS"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setEditing(null)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 gap-2">
                  {saving ? <><Loader2 size={14} className="animate-spin" />Guardando...</> : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
