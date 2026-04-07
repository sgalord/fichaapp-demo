'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Obra, Profile, ObraAssignment } from '@/types'
import {
  Plus, ChevronLeft, ChevronRight, Loader2, X, AlertTriangle,
  HardHat, User, Trash2, CalendarDays, Users,
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

type AssignWithJoins = ObraAssignment & {
  obra?: { id: string; name: string; address: string | null }
  worker?: { id: string; full_name: string; avatar_url?: string | null }
}

export default function AsignacionesPage() {
  const [weekDate, setWeekDate]     = useState(() => weekStart(new Date()))
  const [obras, setObras]           = useState<Obra[]>([])
  const [workers, setWorkers]       = useState<Profile[]>([])
  const [assignments, setAssignments] = useState<AssignWithJoins[]>([])
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [conflict, setConflict]     = useState<string | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)

  const [form, setForm] = useState({
    obra_id: '',
    assignType: 'worker' as 'worker' | 'all',
    worker_id: '',
    date: formatDate(new Date()),
  })

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

  // Assignments grouped by date+obra
  function getAssignmentsForDay(date: string) {
    return assignments.filter(a => a.date === date)
  }

  function openModal(date?: string) {
    setForm({
      obra_id: obras[0]?.id ?? '',
      assignType: 'worker',
      worker_id: workers[0]?.id ?? '',
      date: date ?? formatDate(new Date()),
    })
    setConflict(null)
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.obra_id) return
    setSaving(true); setConflict(null)

    const body = {
      obra_id:   form.obra_id,
      worker_id: form.assignType === 'worker' ? form.worker_id : null,
      group_id:  null,
      date:      form.date,
    }

    const res  = await fetch('/api/obra-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()

    if (!res.ok) {
      if (res.status === 409 && json.conflict) {
        setConflict(json.error)
        setSaving(false)
        return
      }
      setConflict(json.error ?? 'Error al guardar')
      setSaving(false)
      return
    }

    setShowModal(false)
    await loadData()
    setSaving(false)
  }

  async function handleSaveWithConflict() {
    // Force save ignoring conflict (worker can be in multiple obras same day)
    setSaving(true); setConflict(null)
    const body = {
      obra_id:   form.obra_id,
      worker_id: form.assignType === 'worker' ? form.worker_id : null,
      group_id:  null,
      date:      form.date,
      force:     true,
    }
    // We bypass conflict check by using a raw insert via a special flag
    // For now, just insert directly (the API will check again, but we allow it)
    const res  = await fetch('/api/obra-assignments?force=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) { setShowModal(false); await loadData() }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await fetch(`/api/obra-assignments/${id}`, { method: 'DELETE' })
    setAssignments(prev => prev.filter(a => a.id !== id))
    setDeleting(null)
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
        <button onClick={() => openModal()} className="btn-primary gap-2">
          <Plus size={16} />Nueva asignación
        </button>
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
      ) : (
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
                    {/* Group by obra */}
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
                    {/* Assignments without matched active obra */}
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
                    Trabajador concreto
                  </button>
                </div>

                {form.assignType === 'worker' && (
                  <select className="input" value={form.worker_id}
                    onChange={e => setForm(f => ({ ...f, worker_id: e.target.value }))}>
                    <option value="">Seleccionar trabajador...</option>
                    {workers.map(w => (
                      <option key={w.id} value={w.id}>{w.full_name}</option>
                    ))}
                  </select>
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
                  <button onClick={handleSave} disabled={saving || !form.obra_id || (form.assignType === 'worker' && !form.worker_id)}
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
