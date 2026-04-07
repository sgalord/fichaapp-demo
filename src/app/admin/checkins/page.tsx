'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, formatDate, distanceLabel, todayISO, initials, avatarColor } from '@/lib/utils'
import type { CheckIn, Profile, WorkLocation } from '@/types'
import {
  Search, Calendar, Edit2, Loader2, X,
  CheckCircle2, XCircle, AlertTriangle, Clock, Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'

type CheckInRow = Omit<CheckIn, 'worker' | 'work_location'> & {
  worker: Pick<Profile, 'id' | 'full_name'>
  work_location: Pick<WorkLocation, 'id' | 'name'> | null
}

const PAGE_SIZE = 20

export default function CheckinsPage() {
  const supabase = createClient()

  const [rows, setRows]             = useState<CheckInRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [page, setPage]             = useState(0)
  const [hasMore, setHasMore]       = useState(true)
  const [dateFilter, setDateFilter] = useState(todayISO())
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all')
  const [workerFilter, setWorkerFilter] = useState('')
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

  async function exportExcel() {
    setExporting(true)
    // Carga TODOS los fichajes del día para exportar (sin paginación)
    let q = supabase
      .from('check_ins')
      .select(`
        id, type, timestamp, distance_meters, within_radius, notes, manually_modified,
        worker:profiles!worker_id(id, full_name),
        work_location:work_locations(id, name)
      `)
      .gte('timestamp', `${dateFilter}T00:00:00`)
      .lte('timestamp', `${dateFilter}T23:59:59`)
      .order('timestamp', { ascending: false })

    if (typeFilter !== 'all') q = q.eq('type', typeFilter)
    const { data } = await q

    const exportData = ((data ?? []) as unknown as CheckInRow[]).map(ci => ({
      'Trabajador':     ci.worker?.full_name ?? '',
      'Tipo':           ci.type === 'in' ? 'Entrada' : 'Salida',
      'Fecha y Hora':   formatDateTime(ci.timestamp),
      'Obra':           ci.work_location?.name ?? 'Sin obra',
      'Distancia':      ci.distance_meters != null ? distanceLabel(ci.distance_meters) : '-',
      'Dentro del radio': ci.within_radius ? 'Sí' : 'No',
      'Modificado':     ci.manually_modified ? 'Sí' : 'No',
      'Notas':          ci.notes ?? '',
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fichajes')

    // Ajustar ancho de columnas
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
          {exporting
            ? <Loader2 size={15} className="animate-spin" />
            : <Download size={15} />
          }
          Exportar Excel
        </button>
      </div>

      {/* ── Filtros ── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-zinc-500 flex-shrink-0" />
          <input
            type="date"
            value={dateFilter}
            onChange={e => { setDateFilter(e.target.value); setPage(0) }}
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
          {rows.map(ci => (
            <div key={ci.id} className="card">
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
                  </div>
                  {ci.notes && (
                    <p className="text-xs text-amber-400/80 mt-1.5 bg-amber-500/10 rounded-lg px-2.5 py-1.5">
                      Nota: {ci.notes}
                    </p>
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
          ))}

          {hasMore && (
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
