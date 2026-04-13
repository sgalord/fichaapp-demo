'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, formatDate, distanceLabel, todayISO, initials, avatarColor } from '@/lib/utils'
import type { CheckIn, Profile, WorkLocation, Obra } from '@/types'
import {
  Search, Calendar, Edit2, Loader2, X,
  CheckCircle2, XCircle, AlertTriangle, Clock, Download, ShieldAlert, MapPin,
  ChevronLeft, ChevronRight, Plus, ToggleLeft, ToggleRight,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { format, addDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

type CheckInRow = Omit<CheckIn, 'worker' | 'work_location' | 'obra'> & {
  worker: Pick<Profile, 'id' | 'full_name'>
  work_location: Pick<WorkLocation, 'id' | 'name'> | null
  obra: { id: string; name: string } | null
}

const PAGE_SIZE = 100

// ── helpers ─────────────────────────────────────────────────────────────────
function shiftDate(iso: string, days: number): string {
  return format(addDays(parseISO(iso), days), 'yyyy-MM-dd')
}

export default function CheckinsPage() {
  const supabase = createClient()

  // ── Rango de fechas (por defecto ayer + hoy) ─────────────────────────────
  const [dateFrom, setDateFrom] = useState(() => shiftDate(todayISO(), -1))
  const [dateTo,   setDateTo]   = useState(todayISO)

  const [rows,       setRows]       = useState<CheckInRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [page,       setPage]       = useState(0)
  const [hasMore,    setHasMore]    = useState(true)
  const [typeFilter, setTypeFilter] = useState<'all' | 'in' | 'out'>('all')
  const [workerFilter, setWorkerFilter] = useState('')
  const [fraudOnly,  setFraudOnly]  = useState(false)
  const [exporting,  setExporting]  = useState(false)

  // ── Workers y obras para los modales ────────────────────────────────────
  const [workers, setWorkers] = useState<Pick<Profile, 'id' | 'full_name'>[]>([])
  const [obras,   setObras]   = useState<Pick<Obra, 'id' | 'name'>[]>([])

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('active', true).in('role', ['worker', 'admin']).order('full_name')
      .then(({ data }) => setWorkers((data ?? []) as Pick<Profile, 'id' | 'full_name'>[]))
    supabase.from('obras').select('id, name').eq('active', true).order('name')
      .then(({ data }) => setObras((data ?? []) as Pick<Obra, 'id' | 'name'>[]))
  }, []) // eslint-disable-line

  // ── Modal editar ─────────────────────────────────────────────────────────
  const [editing,  setEditing]  = useState<CheckInRow | null>(null)
  const [editForm, setEditForm] = useState({
    timestamp:     '',
    notes:         '',
    type:          'in' as 'in' | 'out',
    within_radius: true,
  })
  const [saving, setSaving] = useState(false)

  // ── Modal nuevo fichaje ───────────────────────────────────────────────────
  const [showNew,  setShowNew]  = useState(false)
  const [newForm,  setNewForm]  = useState({
    worker_id:            '',
    type:                 'in' as 'in' | 'out',
    timestamp:            '',
    obra_id:              '',
    notes:                '',
    within_radius_override: true,
  })
  const [creating, setCreating] = useState(false)
  const [newError, setNewError] = useState('')

  // Inicializar timestamp del modal nuevo con "ahora"
  useEffect(() => {
    if (showNew) {
      setNewForm(f => ({
        ...f,
        timestamp: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        worker_id: '',
        obra_id: '',
        notes: '',
        type: 'in',
        within_radius_override: true,
      }))
      setNewError('')
    }
  }, [showNew])

  // ── Carga ────────────────────────────────────────────────────────────────
  const load = useCallback(async (pageNum: number, reset = false) => {
    setLoading(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from('check_ins')
      .select(`
        id, worker_id, work_location_id, obra_id, type, latitude, longitude,
        distance_meters, within_radius, notes, manually_modified, timestamp,
        photo_url, device_fingerprint,
        worker:profiles!worker_id(id, full_name),
        work_location:work_locations(id, name),
        obra:obras(id, name)
      `)
      .gte('timestamp', `${dateFrom}T00:00:00`)
      .lte('timestamp', `${dateTo}T23:59:59`)
      .order('timestamp', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    if (typeFilter !== 'all') q = q.eq('type', typeFilter)

    const { data } = await q

    const filtered = workerFilter
      ? (data ?? []).filter((ci: CheckInRow) =>
          ci.worker?.full_name?.toLowerCase().includes(workerFilter.toLowerCase())
        )
      : (data ?? [])

    if (!data || data.length < PAGE_SIZE) setHasMore(false)
    else setHasMore(true)

    setRows(prev =>
      reset || pageNum === 0
        ? filtered as CheckInRow[]
        : [...prev, ...filtered as CheckInRow[]]
    )
    setLoading(false)
  }, [supabase, dateFrom, dateTo, typeFilter, workerFilter])

  useEffect(() => {
    setPage(0)
    load(0, true)
  }, [dateFrom, dateTo, typeFilter]) // eslint-disable-line

  // ── Detección de fraude ──────────────────────────────────────────────────
  const suspiciousFps = useMemo(() => {
    const fpWorkers = new Map<string, Set<string>>()
    for (const ci of rows) {
      if (!ci.device_fingerprint) continue
      if (!fpWorkers.has(ci.device_fingerprint)) fpWorkers.set(ci.device_fingerprint, new Set())
      fpWorkers.get(ci.device_fingerprint)!.add(ci.worker_id)
    }
    const suspicious = new Set<string>()
    fpWorkers.forEach((workers, fp) => { if (workers.size >= 2) suspicious.add(fp) })
    return suspicious
  }, [rows])

  const fpWorkersMap = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const ci of rows) {
      if (!ci.device_fingerprint || !suspiciousFps.has(ci.device_fingerprint)) continue
      if (!map.has(ci.device_fingerprint)) map.set(ci.device_fingerprint, [])
      const name = ci.worker?.full_name ?? 'Desconocido'
      if (!map.get(ci.device_fingerprint)!.includes(name)) map.get(ci.device_fingerprint)!.push(name)
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

  // ── Editar fichaje ───────────────────────────────────────────────────────
  function openEdit(ci: CheckInRow) {
    setEditing(ci)
    setEditForm({
      timestamp:     ci.timestamp.slice(0, 16),
      notes:         ci.notes ?? '',
      type:          ci.type,
      within_radius: ci.within_radius,
    })
  }

  async function handleSave() {
    if (!editing) return
    setSaving(true)
    const res = await fetch(`/api/checkins/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp:     editForm.timestamp ? `${editForm.timestamp}:00Z` : undefined,
        notes:         editForm.notes,
        type:          editForm.type,
        within_radius: editForm.within_radius,
      }),
    })
    if (res.ok) { setEditing(null); load(0, true) }
    setSaving(false)
  }

  // ── Crear fichaje (admin) ────────────────────────────────────────────────
  async function handleCreate() {
    if (!newForm.worker_id || !newForm.timestamp) {
      setNewError('Trabajador y fecha/hora son obligatorios.')
      return
    }
    setCreating(true)
    setNewError('')
    const res = await fetch('/api/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        worker_id:              newForm.worker_id,
        type:                   newForm.type,
        timestamp:              `${newForm.timestamp}:00Z`,
        obra_id:                newForm.obra_id || null,
        notes:                  newForm.notes || null,
        within_radius_override: newForm.within_radius_override,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setNewError(json.error ?? 'Error al crear fichaje')
      setCreating(false)
      return
    }
    setShowNew(false)
    setCreating(false)
    load(0, true)
  }

  // ── Navegación de fechas ─────────────────────────────────────────────────
  function shiftRange(days: number) {
    setDateFrom(shiftDate(dateFrom, days))
    setDateTo(shiftDate(dateTo, days))
    setPage(0)
    setFraudOnly(false)
  }

  function goToday() {
    setDateFrom(shiftDate(todayISO(), -1))
    setDateTo(todayISO())
    setPage(0)
    setFraudOnly(false)
  }

  const rangeLabel = dateFrom === dateTo
    ? format(parseISO(dateFrom), "d 'de' MMMM", { locale: es })
    : `${format(parseISO(dateFrom), 'd MMM', { locale: es })} – ${format(parseISO(dateTo), "d 'de' MMMM", { locale: es })}`

  // ── Excel ─────────────────────────────────────────────────────────────────
  async function exportExcel() {
    setExporting(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from('check_ins')
      .select(`
        id, worker_id, type, timestamp, distance_meters, within_radius, notes, manually_modified, device_fingerprint, obra_id,
        worker:profiles!worker_id(id, full_name),
        work_location:work_locations(id, name),
        obra:obras(id, name)
      `)
      .gte('timestamp', `${dateFrom}T00:00:00`)
      .lte('timestamp', `${dateTo}T23:59:59`)
      .order('timestamp', { ascending: false })

    if (typeFilter !== 'all') q = q.eq('type', typeFilter)
    const { data } = await q
    const allForExport = (data ?? []) as CheckInRow[]

    const fpW = new Map<string, Set<string>>()
    for (const ci of allForExport) {
      if (!ci.device_fingerprint) continue
      if (!fpW.has(ci.device_fingerprint)) fpW.set(ci.device_fingerprint, new Set())
      fpW.get(ci.device_fingerprint)!.add(ci.worker_id)
    }
    const suspEx = new Set([...fpW.entries()].filter(([, w]) => w.size >= 2).map(([fp]) => fp))

    const exportData = allForExport.map(ci => ({
      'Trabajador':        ci.worker?.full_name ?? '',
      'Tipo':              ci.type === 'in' ? 'Entrada' : 'Salida',
      'Fecha y Hora':      formatDateTime(ci.timestamp),
      'Obra':              ci.obra?.name ?? ci.work_location?.name ?? 'Sin obra',
      'Distancia':         ci.distance_meters != null ? distanceLabel(ci.distance_meters) : '-',
      'Dentro del radio':  ci.within_radius ? 'Sí' : 'No',
      'Modificado':        ci.manually_modified ? 'Sí' : 'No',
      'Notas':             ci.notes ?? '',
      '⚠️ Posible fraude': ci.device_fingerprint && suspEx.has(ci.device_fingerprint) ? 'SÍ' : 'No',
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Fichajes')
    ws['!cols'] = Object.keys(exportData[0] ?? {}).map(k => ({ wch: Math.max(k.length, 15) }))
    XLSX.writeFile(wb, `FichaApp-fichajes-${dateFrom}_${dateTo}.xlsx`)
    setExporting(false)
  }

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Fichajes</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Registro completo de entradas y salidas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNew(true)}
            className="btn-primary gap-2 text-sm"
          >
            <Plus size={15} /> Nuevo fichaje
          </button>
          <button
            onClick={exportExcel}
            disabled={exporting || rows.length === 0}
            className="btn-secondary gap-2 text-sm"
          >
            {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            Excel
          </button>
        </div>
      </div>

      {/* ── Alerta fraude ── */}
      {fraudCount > 0 && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3.5">
          <ShieldAlert size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-300">
              ⚠️ Posible fraude — {suspiciousFps.size} dispositivo{suspiciousFps.size > 1 ? 's' : ''} compartido{suspiciousFps.size > 1 ? 's' : ''}
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
              fraudOnly ? 'bg-red-500 text-white' : 'bg-red-500/20 text-red-300 hover:bg-red-500/30'
            }`}
          >
            {fraudOnly ? 'Ver todos' : 'Ver solo fraudes'}
          </button>
        </div>
      )}

      {/* ── Navegación de fechas ── */}
      <div className="space-y-3">
        {/* Prev / rango / Next */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftRange(-1)}
            className="p-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
            title="Día anterior"
          >
            <ChevronLeft size={16} />
          </button>

          <div className="flex-1 flex items-center gap-2 min-w-0">
            {/* fecha desde */}
            <div className="relative flex-1">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={e => { setDateFrom(e.target.value); setPage(0); setFraudOnly(false) }}
                className="input pl-8 text-sm w-full"
              />
            </div>

            <span className="text-zinc-600 text-sm flex-shrink-0">–</span>

            {/* fecha hasta */}
            <div className="relative flex-1">
              <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={e => { setDateTo(e.target.value); setPage(0); setFraudOnly(false) }}
                className="input pl-8 text-sm w-full"
              />
            </div>
          </div>

          <button
            onClick={() => shiftRange(1)}
            className="p-2 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
            title="Día siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Etiqueta del rango + botón hoy */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-400 capitalize">{rangeLabel}</p>
          <button
            onClick={goToday}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded-lg hover:bg-zinc-800"
          >
            Hoy
          </button>
        </div>

        {/* Filtros tipo + búsqueda */}
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
          <p className="text-sm">Sin fichajes en este período</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayRows.map(ci => {
            const isFraud = !!ci.device_fingerprint && suspiciousFps.has(ci.device_fingerprint)
            const sharedWith = isFraud
              ? fpWorkersMap.get(ci.device_fingerprint!)?.filter(n => n !== ci.worker?.full_name)
              : []

            return (
              <div key={ci.id} className={`card ${isFraud ? 'border-red-500/30 bg-red-500/5' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`${avatarColor(ci.worker?.full_name ?? '')} w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {initials(ci.worker?.full_name ?? '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-zinc-200 text-sm truncate">{ci.worker?.full_name ?? 'Trabajador'}</p>
                    {(ci.obra || ci.work_location) && (
                      <p className="text-xs text-zinc-600 truncate mt-0.5">
                        {ci.obra?.name ?? ci.work_location?.name}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={ci.type === 'in' ? 'badge-green' : 'badge-red'}>
                        {ci.type === 'in' ? 'Entrada' : 'Salida'}
                      </span>
                      {ci.distance_meters != null && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                          ci.within_radius
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border-red-500/20'
                        }`}>
                          <MapPin size={9} />
                          {distanceLabel(ci.distance_meters)}
                          {!ci.within_radius && ' · Fuera radio'}
                        </span>
                      )}
                      {ci.within_radius && ci.distance_meters == null && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          <MapPin size={9} /> Dentro radio
                        </span>
                      )}
                      {!ci.within_radius && ci.distance_meters == null && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border bg-red-500/10 text-red-400 border-red-500/20">
                          <MapPin size={9} /> Fuera radio
                        </span>
                      )}
                      {ci.manually_modified && <span className="badge-gray">Modificado</span>}
                      {isFraud && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30">
                          <ShieldAlert size={9} /> Mismo dispositivo
                        </span>
                      )}
                    </div>
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
                      <a href={ci.photo_url} target="_blank" rel="noopener noreferrer"
                        className="mt-1.5 block rounded-xl overflow-hidden border border-zinc-700 hover:border-zinc-500 transition-colors"
                        title="Ver foto completa"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ci.photo_url} alt="Foto del fichaje" className="w-full h-28 object-cover" />
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

      {/* ══ Modal: EDITAR fichaje ══════════════════════════════════════════════ */}
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

              {/* Tipo */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-2 block">Tipo</label>
                <div className="flex gap-2">
                  {(['in', 'out'] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => setEditForm(f => ({ ...f, type: t }))}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all ${
                        editForm.type === t
                          ? t === 'in' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      {t === 'in' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      {t === 'in' ? 'Entrada' : 'Salida'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fecha y hora */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Fecha y hora</label>
                <input type="datetime-local" className="input"
                  value={editForm.timestamp}
                  onChange={e => setEditForm(f => ({ ...f, timestamp: e.target.value }))}
                />
              </div>

              {/* Dentro del radio */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-2 block">Estado GPS</label>
                <button
                  type="button"
                  onClick={() => setEditForm(f => ({ ...f, within_radius: !f.within_radius }))}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                    editForm.within_radius
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <MapPin size={15} />
                    {editForm.within_radius ? 'Dentro del radio ✓' : 'Fuera del radio ✗'}
                  </span>
                  {editForm.within_radius
                    ? <ToggleRight size={22} className="text-emerald-400" />
                    : <ToggleLeft size={22} className="text-zinc-500" />
                  }
                </button>
                <p className="text-xs text-zinc-600 mt-1.5">
                  Cambia este estado si hubo un error de GPS y el trabajador sí estaba en la obra.
                </p>
              </div>

              {/* Notas */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Notas (motivo de modificación)</label>
                <textarea className="input min-h-[80px] resize-none"
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

      {/* ══ Modal: NUEVO fichaje (admin) ══════════════════════════════════════ */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="font-semibold text-white">Nuevo fichaje manual</h2>
              <button onClick={() => setShowNew(false)} className="text-zinc-500 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">

              {/* Trabajador */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Trabajador *</label>
                <select
                  className="input"
                  value={newForm.worker_id}
                  onChange={e => setNewForm(f => ({ ...f, worker_id: e.target.value }))}
                >
                  <option value="">Seleccionar trabajador…</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.full_name}</option>
                  ))}
                </select>
              </div>

              {/* Tipo */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-2 block">Tipo *</label>
                <div className="flex gap-2">
                  {(['in', 'out'] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => setNewForm(f => ({ ...f, type: t }))}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-sm transition-all ${
                        newForm.type === t
                          ? t === 'in' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                      }`}
                    >
                      {t === 'in' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
                      {t === 'in' ? 'Entrada' : 'Salida'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fecha y hora */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Fecha y hora *</label>
                <input type="datetime-local" className="input"
                  value={newForm.timestamp}
                  onChange={e => setNewForm(f => ({ ...f, timestamp: e.target.value }))}
                />
              </div>

              {/* Obra */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Obra (opcional)</label>
                <select
                  className="input"
                  value={newForm.obra_id}
                  onChange={e => setNewForm(f => ({ ...f, obra_id: e.target.value }))}
                >
                  <option value="">Sin obra</option>
                  {obras.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Dentro del radio */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-2 block">Estado GPS</label>
                <button
                  type="button"
                  onClick={() => setNewForm(f => ({ ...f, within_radius_override: !f.within_radius_override }))}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${
                    newForm.within_radius_override
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <MapPin size={15} />
                    {newForm.within_radius_override ? 'Dentro del radio ✓' : 'Fuera del radio ✗'}
                  </span>
                  {newForm.within_radius_override
                    ? <ToggleRight size={22} className="text-emerald-400" />
                    : <ToggleLeft size={22} className="text-zinc-500" />
                  }
                </button>
              </div>

              {/* Notas */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Notas (motivo)</label>
                <textarea className="input min-h-[72px] resize-none"
                  value={newForm.notes}
                  onChange={e => setNewForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ej: Fichaje olvidado, corrección manual…"
                />
              </div>

              {newError && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertTriangle size={15} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-300">{newError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowNew(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleCreate} disabled={creating} className="btn-primary flex-1 gap-2">
                  {creating ? <><Loader2 size={14} className="animate-spin" />Creando...</> : 'Crear fichaje'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
