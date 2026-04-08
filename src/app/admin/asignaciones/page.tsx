'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Obra, Profile, ObraAssignment } from '@/types'
import {
  Plus, ChevronLeft, ChevronRight, Loader2, X, AlertTriangle,
  HardHat, User, Trash2, CalendarDays, Users, LayoutGrid, List,
  ChevronDown, GripVertical,
} from 'lucide-react'
import { initials, avatarColor } from '@/lib/utils'

function formatDate(d: Date) {
  return d.toISOString().split('T')[0]
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function weekStart(d: Date) {
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  return addDays(d, diff)
}
function formatShort(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}
function formatDayShort(iso: string) {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
}

type AssignWithJoins = ObraAssignment & {
  obra?: { id: string; name: string; address: string | null }
  worker?: { id: string; full_name: string; avatar_url?: string | null }
}

// ── Multi-select worker dropdown ─────────────────────────────────────────────
function WorkerMultiSelect({
  workers,
  selectedIds,
  onChange,
}: {
  workers: Profile[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  }

  const label = selectedIds.length === 0
    ? 'Seleccionar trabajadores...'
    : selectedIds.length === 1
      ? workers.find(w => w.id === selectedIds[0])?.full_name ?? '1 trabajador'
      : `${selectedIds.length} trabajadores seleccionados`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="input w-full flex items-center justify-between gap-2 text-left"
      >
        <span className={selectedIds.length === 0 ? 'text-zinc-500' : 'text-zinc-200'}>{label}</span>
        <ChevronDown size={14} className={`flex-shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-20 max-h-52 overflow-y-auto">
          {workers.map(w => (
            <label
              key={w.id}
              className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-700 cursor-pointer transition-colors first:rounded-t-xl last:rounded-b-xl"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(w.id)}
                onChange={() => toggle(w.id)}
                className="accent-white w-3.5 h-3.5 flex-shrink-0"
              />
              <div className={`${avatarColor(w.full_name)} w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0`}>
                {initials(w.full_name)}
              </div>
              <span className="text-sm text-zinc-200 truncate">{w.full_name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Worker chip (used in board view) ─────────────────────────────────────────
function WorkerChip({
  worker,
  assignmentId,
  obraId,
  onDelete,
  onDragStart,
  isDragging,
}: {
  worker: Profile
  assignmentId: string | null
  obraId: string | null
  onDelete?: () => void
  onDragStart: (workerId: string, workerName: string, fromObraId: string | null, assignmentId: string | null) => void
  isDragging?: boolean
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(worker.id, worker.full_name, obraId, assignmentId)}
      className={`flex items-center gap-1.5 bg-zinc-700/70 border border-zinc-600/50 rounded-lg px-2 py-1.5 cursor-grab active:cursor-grabbing select-none transition-opacity ${isDragging ? 'opacity-40' : 'hover:bg-zinc-600/70'}`}
    >
      <GripVertical size={10} className="text-zinc-500 flex-shrink-0" />
      <div className={`${avatarColor(worker.full_name)} w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0`}>
        {initials(worker.full_name)}
      </div>
      <span className="text-xs text-zinc-200 leading-tight">{worker.full_name.split(' ')[0]} {worker.full_name.split(' ')[1] ?? ''}</span>
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete() }}
          className="ml-0.5 text-zinc-500 hover:text-red-400 transition-colors flex-shrink-0"
        >
          <X size={11} />
        </button>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AsignacionesPage() {
  const [weekDate, setWeekDate]       = useState(() => weekStart(new Date()))
  const [obras, setObras]             = useState<Obra[]>([])
  const [workers, setWorkers]         = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<AssignWithJoins[]>([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [saving, setSaving]           = useState(false)
  const [conflict, setConflict]       = useState<string | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)

  // View mode
  const [viewMode, setViewMode]       = useState<'week' | 'board'>('week')
  const [boardDay, setBoardDay]       = useState(formatDate(new Date()))

  // Form state
  const [form, setForm] = useState({
    obra_id: '',
    assignType: 'worker' as 'worker' | 'all',
    date: formatDate(new Date()),
  })
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([])

  // Board drag state
  const [dragWorker, setDragWorker] = useState<{
    workerId: string
    workerName: string
    fromObraId: string | null
    assignmentId: string | null
  } | null>(null)
  const [dragOverCol, setDragOverCol] = useState<string | 'unassigned' | null>(null)

  const weekDays = Array.from({ length: 7 }, (_, i) => formatDate(addDays(weekDate, i)))

  const loadData = useCallback(async () => {
    setLoading(true)
    const [obrasRes, workersRes, assignRes] = await Promise.all([
      fetch('/api/obras'),
      fetch('/api/workers'),
      fetch(`/api/obra-assignments?date_from=${weekDays[0]}&date_to=${weekDays[6]}`),
    ])

    if (obrasRes.ok)   { const { data } = await obrasRes.json();   setObras(data ?? []) }
    if (workersRes.ok) { const { data } = await workersRes.json(); setWorkers((data ?? []).filter((w: Profile) => w.active)) }
    if (assignRes.ok)  { const { data } = await assignRes.json();  setAssignments(data ?? []) }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDate])

  useEffect(() => { loadData() }, [loadData])

  // Keep boardDay within the loaded week
  useEffect(() => {
    if (!weekDays.includes(boardDay)) setBoardDay(weekDays[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDate])

  function getAssignmentsForDay(date: string) {
    return assignments.filter(a => a.date === date)
  }

  function openModal(date?: string) {
    setForm({
      obra_id: activeObras[0]?.id ?? '',
      assignType: 'worker',
      date: date ?? formatDate(new Date()),
    })
    setSelectedWorkerIds([])
    setConflict(null)
    setShowModal(true)
  }

  // ── Save assignment(s) ────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.obra_id) return
    setSaving(true); setConflict(null)

    if (form.assignType === 'all') {
      await Promise.all(workers.map(w =>
        fetch('/api/obra-assignments?force=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ obra_id: form.obra_id, worker_id: w.id, group_id: null, date: form.date }),
        })
      ))
      setShowModal(false)
      await loadData()
      setSaving(false)
      return
    }

    if (selectedWorkerIds.length === 0) { setSaving(false); return }

    if (selectedWorkerIds.length > 1) {
      await Promise.all(selectedWorkerIds.map(wid =>
        fetch('/api/obra-assignments?force=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ obra_id: form.obra_id, worker_id: wid, group_id: null, date: form.date }),
        })
      ))
      setShowModal(false)
      await loadData()
      setSaving(false)
      return
    }

    // Single worker: normal flow with conflict detection
    const res  = await fetch('/api/obra-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ obra_id: form.obra_id, worker_id: selectedWorkerIds[0], group_id: null, date: form.date }),
    })
    const json = await res.json()

    if (!res.ok) {
      if (res.status === 409 && json.conflict) { setConflict(json.error); setSaving(false); return }
      setConflict(json.error ?? 'Error al guardar')
      setSaving(false)
      return
    }

    setShowModal(false)
    await loadData()
    setSaving(false)
  }

  async function handleSaveWithConflict() {
    setSaving(true); setConflict(null)
    await Promise.all(selectedWorkerIds.map(wid =>
      fetch('/api/obra-assignments?force=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obra_id: form.obra_id, worker_id: wid, group_id: null, date: form.date }),
      })
    ))
    setShowModal(false)
    await loadData()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await fetch(`/api/obra-assignments/${id}`, { method: 'DELETE' })
    setAssignments(prev => prev.filter(a => a.id !== id))
    setDeleting(null)
  }

  // ── Board drag handlers ───────────────────────────────────────────────────
  function handleDragStart(workerId: string, workerName: string, fromObraId: string | null, assignmentId: string | null) {
    setDragWorker({ workerId, workerName, fromObraId, assignmentId })
  }

  function handleDragOver(e: React.DragEvent, col: string | 'unassigned') {
    e.preventDefault()
    setDragOverCol(col)
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only clear if leaving the column entirely
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOverCol(null)
    }
  }

  async function handleDrop(e: React.DragEvent, toObraId: string | 'unassigned') {
    e.preventDefault()
    setDragOverCol(null)
    if (!dragWorker) return

    const { workerId, fromObraId, assignmentId } = dragWorker
    setDragWorker(null)

    if (toObraId === 'unassigned') {
      if (assignmentId) await handleDelete(assignmentId)
      return
    }

    if (fromObraId === toObraId) return

    // Delete old assignment if moving from another obra
    if (assignmentId && fromObraId !== null) {
      await fetch(`/api/obra-assignments/${assignmentId}`, { method: 'DELETE' })
    }

    await fetch('/api/obra-assignments?force=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ obra_id: toObraId, worker_id: workerId, group_id: null, date: boardDay }),
    })
    await loadData()
  }

  // ── Derived board data ────────────────────────────────────────────────────
  const boardAssignments = assignments.filter(a => a.date === boardDay)
  const assignedWorkerIdSet = new Set(boardAssignments.map(a => a.worker_id).filter(Boolean))
  const unassignedWorkers = workers.filter(w => !assignedWorkerIdSet.has(w.id))

  function getBoardObraWorkers(obraId: string) {
    return boardAssignments
      .filter(a => a.obra_id === obraId && a.worker_id)
      .map(a => ({ assignment: a, worker: workers.find(w => w.id === a.worker_id) ?? null }))
      .filter((x): x is { assignment: AssignWithJoins; worker: Profile } => x.worker !== null)
  }

  const activeObras = obras.filter(o => o.active)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Asignaciones</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Asigna trabajadores a obras por día</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center bg-zinc-800 rounded-xl p-1 gap-0.5">
            <button
              onClick={() => setViewMode('week')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === 'week' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
            >
              <List size={13} />Lista
            </button>
            <button
              onClick={() => setViewMode('board')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${viewMode === 'board' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
            >
              <LayoutGrid size={13} />Tablero
            </button>
          </div>
          <button onClick={() => openModal()} className="btn-primary gap-2">
            <Plus size={16} />Nueva asignación
          </button>
        </div>
      </div>

      {/* ── Week navigation ── */}
      <div className="flex items-center gap-3">
        <button onClick={() => setWeekDate(d => addDays(d, -7))}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div className="flex-1 text-center">
          <p className="text-sm font-medium text-white">
            {weekDays[0]} — {weekDays[6]}
          </p>
        </div>
        <button onClick={() => setWeekDate(d => addDays(d, 7))}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
          <ChevronRight size={18} />
        </button>
        <button onClick={() => setWeekDate(weekStart(new Date()))}
          className="text-xs text-zinc-500 hover:text-white border border-zinc-700 rounded-lg px-3 py-1.5 transition-colors">
          Hoy
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
      ) : viewMode === 'week' ? (
        /* ══════════════════════════════════════════════════════════════════
           WEEK VIEW
        ══════════════════════════════════════════════════════════════════ */
        <div className="space-y-3">
          {weekDays.map(date => {
            const dayAssignments = getAssignmentsForDay(date)
            const isToday = date === formatDate(new Date())
            return (
              <div key={date} className={`card ${isToday ? 'border-zinc-600' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${isToday ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
                    <span className={`text-sm font-semibold capitalize ${isToday ? 'text-white' : 'text-zinc-300'}`}>
                      {formatShort(date)}
                    </span>
                    {isToday && <span className="badge-gray text-[10px]">Hoy</span>}
                  </div>
                  <button onClick={() => openModal(date)}
                    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                    <Plus size={14} />
                  </button>
                </div>

                {dayAssignments.length === 0 ? (
                  <p className="text-xs text-zinc-600 py-1">Sin asignaciones</p>
                ) : (
                  <div className="space-y-1.5">
                    {activeObras
                      .filter(obra => dayAssignments.some(a => a.obra_id === obra.id))
                      .map(obra => {
                        const obraAssigns = dayAssignments.filter(a => a.obra_id === obra.id)
                        return (
                          <div key={obra.id} className="bg-zinc-800/50 rounded-xl p-2.5">
                            <div className="flex items-center gap-2 mb-2">
                              <HardHat size={13} className="text-amber-400 flex-shrink-0" />
                              <span className="text-xs font-semibold text-amber-300">{obra.name}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {obraAssigns.map(a => (
                                <div key={a.id}
                                  className="flex items-center gap-1.5 bg-zinc-700/60 rounded-lg px-2 py-1">
                                  {a.worker ? (
                                    <>
                                      <div className={`${avatarColor(a.worker.full_name)} w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0`}>
                                        {initials(a.worker.full_name)}
                                      </div>
                                      <span className="text-xs text-zinc-200">{a.worker.full_name.split(' ')[0]}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Users size={12} className="text-zinc-400" />
                                      <span className="text-xs text-zinc-400">Todos</span>
                                    </>
                                  )}
                                  <button onClick={() => handleDelete(a.id)}
                                    disabled={deleting === a.id}
                                    className="ml-0.5 text-zinc-600 hover:text-red-400 transition-colors">
                                    {deleting === a.id
                                      ? <Loader2 size={11} className="animate-spin" />
                                      : <X size={11} />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    {dayAssignments
                      .filter(a => !activeObras.find(o => o.id === a.obra_id))
                      .map(a => (
                        <div key={a.id} className="flex items-center gap-2 text-xs text-zinc-500">
                          <HardHat size={12} />
                          <span>{a.obra?.name ?? 'Obra desconocida'}</span>
                          <span>—</span>
                          <span>{a.worker?.full_name ?? 'Todos'}</span>
                          <button onClick={() => handleDelete(a.id)} className="text-zinc-600 hover:text-red-400">
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        /* ══════════════════════════════════════════════════════════════════
           BOARD VIEW (drag & drop)
        ══════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          {/* Day tabs */}
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {weekDays.map(date => {
              const isToday = date === formatDate(new Date())
              const isActive = date === boardDay
              return (
                <button
                  key={date}
                  onClick={() => setBoardDay(date)}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-colors capitalize whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-zinc-950'
                      : isToday
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  {formatDayShort(date)}
                  {isToday && !isActive && <span className="ml-1 text-[9px]">hoy</span>}
                </button>
              )
            })}
          </div>

          {/* Drag hint */}
          <p className="text-xs text-zinc-600 flex items-center gap-1.5">
            <GripVertical size={12} />
            Arrastra trabajadores entre columnas para asignarlos. Suelta en &quot;Sin asignar&quot; para quitar.
          </p>

          {/* Board columns */}
          <div className="flex gap-3 overflow-x-auto pb-4">

            {/* Unassigned column */}
            <div
              onDragOver={e => handleDragOver(e, 'unassigned')}
              onDragLeave={handleDragLeave}
              onDrop={e => handleDrop(e, 'unassigned')}
              className={`flex-shrink-0 w-44 rounded-2xl border transition-colors ${
                dragOverCol === 'unassigned'
                  ? 'border-red-500/50 bg-red-500/5'
                  : 'border-zinc-700 bg-zinc-800/30'
              }`}
            >
              <div className="px-3 py-3 border-b border-zinc-700/50">
                <div className="flex items-center gap-2">
                  <Users size={13} className="text-zinc-500" />
                  <span className="text-xs font-semibold text-zinc-400">Sin asignar</span>
                  <span className="ml-auto text-[10px] text-zinc-600 bg-zinc-800 rounded-full px-1.5 py-0.5">
                    {unassignedWorkers.length}
                  </span>
                </div>
              </div>
              <div className="p-2 space-y-1.5 min-h-24">
                {unassignedWorkers.length === 0 ? (
                  <p className="text-[10px] text-zinc-700 text-center py-4">Todos asignados</p>
                ) : (
                  unassignedWorkers.map(w => (
                    <WorkerChip
                      key={w.id}
                      worker={w}
                      assignmentId={null}
                      obraId={null}
                      onDragStart={handleDragStart}
                      isDragging={dragWorker?.workerId === w.id}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Obra columns */}
            {activeObras.map(obra => {
              const obraWorkers = getBoardObraWorkers(obra.id)
              const isOver = dragOverCol === obra.id
              return (
                <div
                  key={obra.id}
                  onDragOver={e => handleDragOver(e, obra.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={e => handleDrop(e, obra.id)}
                  className={`flex-shrink-0 w-44 rounded-2xl border transition-colors ${
                    isOver
                      ? 'border-amber-500/50 bg-amber-500/5'
                      : 'border-zinc-700 bg-zinc-800/30'
                  }`}
                >
                  <div className="px-3 py-3 border-b border-zinc-700/50">
                    <div className="flex items-center gap-2">
                      <HardHat size={13} className="text-amber-400 flex-shrink-0" />
                      <span className="text-xs font-semibold text-amber-300 truncate">{obra.name}</span>
                      <span className="ml-auto flex-shrink-0 text-[10px] text-zinc-600 bg-zinc-800 rounded-full px-1.5 py-0.5">
                        {obraWorkers.length}
                      </span>
                    </div>
                  </div>
                  <div className="p-2 space-y-1.5 min-h-24">
                    {obraWorkers.length === 0 && !isOver ? (
                      <p className="text-[10px] text-zinc-700 text-center py-4">Soltar aquí</p>
                    ) : (
                      obraWorkers.map(({ assignment, worker }) => (
                        <WorkerChip
                          key={assignment.id}
                          worker={worker}
                          assignmentId={assignment.id}
                          obraId={obra.id}
                          onDelete={() => handleDelete(assignment.id)}
                          onDragStart={handleDragStart}
                          isDragging={dragWorker?.workerId === worker.id}
                        />
                      ))
                    )}
                    {isOver && (
                      <div className="border-2 border-dashed border-amber-500/30 rounded-lg py-3 text-center text-[10px] text-amber-500/60">
                        Soltar aquí
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="font-semibold text-white">Nueva asignación</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white p-1"><X size={20} /></button>
            </div>
            <div className="px-5 py-5 space-y-4">

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block flex items-center gap-1.5">
                  <CalendarDays size={13} />Día
                </label>
                <input type="date" className="input" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block flex items-center gap-1.5">
                  <HardHat size={13} />Obra
                </label>
                <select className="input" value={form.obra_id}
                  onChange={e => setForm(f => ({ ...f, obra_id: e.target.value }))}>
                  <option value="">Seleccionar obra...</option>
                  {activeObras.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-2 block flex items-center gap-1.5">
                  <User size={13} />Asignar a
                </label>
                <div className="flex gap-2 mb-3">
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, assignType: 'worker' }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      form.assignType === 'worker'
                        ? 'bg-white text-zinc-950 border-white'
                        : 'bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500'
                    }`}>
                    <User size={13} className="inline mr-1.5" />Trabajadores
                  </button>
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, assignType: 'all' }))}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                      form.assignType === 'all'
                        ? 'bg-white text-zinc-950 border-white'
                        : 'bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500'
                    }`}>
                    <Users size={13} className="inline mr-1.5" />Todos
                  </button>
                </div>

                {form.assignType === 'worker' && (
                  <WorkerMultiSelect
                    workers={workers}
                    selectedIds={selectedWorkerIds}
                    onChange={setSelectedWorkerIds}
                  />
                )}

                {form.assignType === 'all' && (
                  <p className="text-xs text-zinc-500 bg-zinc-800 rounded-xl px-3 py-2.5 flex items-center gap-2">
                    <Users size={13} className="text-zinc-400 flex-shrink-0" />
                    Se asignarán los {workers.length} trabajadores activos a esta obra.
                  </p>
                )}
              </div>

              {/* Conflict warning */}
              {conflict && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-amber-300">{conflict}</p>
                  </div>
                  <p className="text-xs text-zinc-500 ml-5">
                    ¿Deseas asignarlo igualmente a ambas obras?
                  </p>
                  <div className="flex gap-2 ml-5">
                    <button onClick={handleSaveWithConflict} disabled={saving}
                      className="flex-1 py-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-medium hover:bg-amber-500/30 transition-colors">
                      Sí, asignar a las dos
                    </button>
                    <button onClick={() => setConflict(null)}
                      className="flex-1 py-1.5 bg-zinc-800 text-zinc-400 rounded-lg text-xs font-medium hover:bg-zinc-700 transition-colors">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {!conflict && (
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
                  <button
                    onClick={handleSave}
                    disabled={
                      saving ||
                      !form.obra_id ||
                      (form.assignType === 'worker' && selectedWorkerIds.length === 0)
                    }
                    className="btn-primary flex-1 gap-2">
                    {saving ? <><Loader2 size={14} className="animate-spin" />Guardando...</> : 'Guardar'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
