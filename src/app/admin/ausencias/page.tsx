'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ABSENCE_TYPE_LABELS, ABSENCE_STATUS_LABELS,
  type Absence, type AbsenceStatus,
} from '@/types'
import { formatDate, initials, avatarColor } from '@/lib/utils'
import {
  Loader2, Check, X, Search, CalendarOff, FileText,
  ChevronDown, Clock, CheckCircle2, XCircle, Filter,
  ExternalLink, Trash2, MessageSquare, BarChart3, ListChecks,
  Edit2, Save, Plus, StickyNote, Upload, Paperclip,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Tipos ─────────────────────────────────────────────────────────────────

type AbsenceRow = Absence & {
  worker: { id: string; full_name: string; avatar_url: string | null }
}

interface WorkerBalance {
  worker_id: string
  worker: { id: string; full_name: string; avatar_url: string | null }
  year: number
  vacation_total: number
  vacation_used: number
  vacation_remaining: number
  personal_total: number
  personal_used: number
  personal_remaining: number
  sick_used: number
  other_used: number
}

const STATUS_CONFIG = {
  pending:  { label: 'Pendiente', classes: 'badge-orange' },
  approved: { label: 'Aprobado',  classes: 'badge-green'  },
  rejected: { label: 'Rechazado', classes: 'badge-red'    },
}

function dayCount(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000) + 1
}

// ── Componente principal ──────────────────────────────────────────────────

export default function AusenciasAdminPage() {
  const supabase = createClient()
  const [tab, setTab] = useState<'solicitudes' | 'saldos'>('solicitudes')

  return (
    <div className="space-y-6">
      {/* ── Cabecera ── */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <CalendarOff size={20} className="text-amber-400" />
          Gestión de Personal
        </h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Gestión de solicitudes y saldos de vacaciones
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('solicitudes')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'solicitudes' ? 'bg-white text-zinc-950' : 'text-zinc-500 hover:text-zinc-200'
          )}
        >
          <ListChecks size={15} />Solicitudes
        </button>
        <button
          onClick={() => setTab('saldos')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'saldos' ? 'bg-white text-zinc-950' : 'text-zinc-500 hover:text-zinc-200'
          )}
        >
          <BarChart3 size={15} />Gestión de días libres
        </button>
      </div>

      {tab === 'solicitudes' ? <TabSolicitudes /> : <TabSaldos />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// TAB: SOLICITUDES
// ══════════════════════════════════════════════════════════════════════════

interface WorkerSimple { id: string; full_name: string; avatar_url: string | null }

function TabSolicitudes() {
  const supabase = createClient()

  const [rows, setRows]         = useState<AbsenceRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatusFilter] = useState<AbsenceStatus | 'all'>('pending')
  const [workerFilter, setWorkerFilter] = useState('')
  const [message, setMessage]   = useState<{ text: string; ok: boolean } | null>(null)

  // Modal revisar
  const [reviewing, setReviewing]   = useState<AbsenceRow | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [adminNoteReview, setAdminNoteReview] = useState('')
  const [saving, setSaving]         = useState(false)

  // Modal editar (admin edita cualquier ausencia)
  const [editing, setEditing]       = useState<AbsenceRow | null>(null)
  const [editForm, setEditForm]     = useState({ type: 'vacation' as keyof typeof ABSENCE_TYPE_LABELS, date_from: '', date_to: '', reason: '' })
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError]   = useState('')

  // Nota inline (editar por fila)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [inlineNote, setInlineNote]       = useState('')
  const [savingNote, setSavingNote]       = useState(false)

  // Upload de documento en modal editar
  const [docFile, setDocFile]         = useState<File | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docUploadError, setDocUploadError] = useState('')

  // Modal crear (admin)
  const [showCreate, setShowCreate]   = useState(false)
  const [workers, setWorkers]         = useState<WorkerSimple[]>([])
  const [createForm, setCreateForm]   = useState({
    worker_id: '', type: 'vacation' as keyof typeof ABSENCE_TYPE_LABELS,
    date_from: '', date_to: '', reason: '', admin_note: '', pre_approved: true,
  })
  const [creating, setCreating]       = useState(false)
  const [createError, setCreateError] = useState('')

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token
  }, [supabase])

  // Sube un archivo al bucket absence-documents y guarda la URL en la ausencia
  async function uploadDocument(absenceId: string, workerId: string) {
    if (!docFile) return
    setUploadingDoc(true)
    setDocUploadError('')

    // Validar tamaño (máx 10 MB)
    if (docFile.size > 10 * 1024 * 1024) {
      setDocUploadError('El archivo no puede superar 10 MB.')
      setUploadingDoc(false)
      return
    }

    const ext  = docFile.name.split('.').pop()?.toLowerCase() ?? 'pdf'
    const path = `${workerId}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('absence-documents')
      .upload(path, docFile, { upsert: true })

    if (uploadErr) {
      setDocUploadError(`Error al subir: ${uploadErr.message}`)
      setUploadingDoc(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage
      .from('absence-documents')
      .getPublicUrl(path)

    const token = await getToken()
    const res = await fetch(`/api/absences/${absenceId}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body:    JSON.stringify({ document_url: publicUrl }),
    })

    if (res.ok) {
      const json = await res.json()
      const newUrl: string = json.data?.document_url ?? publicUrl
      // Actualizar ambos modales (solo uno estará abierto a la vez)
      setEditing(prev   => prev ? { ...prev, document_url: newUrl } : null)
      setReviewing(prev => prev ? { ...prev, document_url: newUrl } : null)
      setRows(prev => prev.map(r => r.id === absenceId ? { ...r, document_url: newUrl } : r))
      setDocFile(null)
      setMessage({ text: 'Documento subido correctamente', ok: true })
    } else {
      const json = await res.json()
      setDocUploadError(json.error ?? 'Error al guardar el documento')
    }
    setUploadingDoc(false)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const token = await getToken()
    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)
    const res = await fetch(`/api/absences?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const json = await res.json()
    setRows((json.data ?? []) as AbsenceRow[])
    setLoading(false)
  }, [supabase, statusFilter, getToken])

  useEffect(() => { load() }, [load])

  // Cargar trabajadores para el modal de crear
  async function openCreate() {
    if (workers.length === 0) {
      const res = await fetch('/api/workers')
      const json = await res.json()
      setWorkers((json.data ?? []).filter((w: WorkerSimple & { active: boolean }) => w.active))
    }
    const today = new Date().toISOString().slice(0, 10)
    setCreateForm({ worker_id: '', type: 'vacation', date_from: today, date_to: today, reason: '', admin_note: '', pre_approved: true })
    setCreateError('')
    setShowCreate(true)
  }

  async function submitCreate() {
    if (!createForm.worker_id || !createForm.date_from || !createForm.date_to) {
      setCreateError('Trabajador y fechas son obligatorios')
      return
    }
    setCreating(true)
    setCreateError('')
    const token = await getToken()
    const res = await fetch('/api/absences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        worker_id:    createForm.worker_id,
        type:         createForm.type,
        date_from:    createForm.date_from,
        date_to:      createForm.date_to,
        reason:       createForm.reason || null,
        admin_note:   createForm.admin_note || null,
        pre_approved: createForm.pre_approved,
      }),
    })
    const json = await res.json()
    setCreating(false)
    if (!res.ok) { setCreateError(json.error ?? 'Error al crear'); return }
    setShowCreate(false)
    setMessage({ text: `Ausencia creada${createForm.pre_approved ? ' y aprobada' : ''}`, ok: true })
    await load()
  }

  async function submitReview(status: 'approved' | 'rejected') {
    if (!reviewing) return
    setSaving(true)
    setMessage(null)
    const token = await getToken()
    const res = await fetch(`/api/absences/${reviewing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ status, review_notes: reviewNote || null, admin_note: adminNoteReview || null }),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setMessage({ text: json.error ?? 'Error', ok: false }); return }
    setMessage({ text: status === 'approved' ? 'Ausencia aprobada' : 'Ausencia rechazada', ok: true })
    setReviewing(null)
    await load()
  }

  async function saveInlineNote(id: string) {
    setSavingNote(true)
    const token = await getToken()
    await fetch(`/api/absences/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ admin_note: inlineNote || null }),
    })
    setSavingNote(false)
    setEditingNoteId(null)
    // Actualizar la fila localmente sin recargar todo
    setRows(prev => prev.map(r => r.id === id ? { ...r, admin_note: inlineNote || null } : r))
  }

  async function submitEdit() {
    if (!editing) return
    if (!editForm.date_from || !editForm.date_to) { setEditError('Las fechas son obligatorias'); return }
    if (editForm.date_to < editForm.date_from) { setEditError('La fecha fin debe ser posterior al inicio'); return }
    setSavingEdit(true)
    setEditError('')
    const token = await getToken()
    const res = await fetch(`/api/absences/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        type:      editForm.type,
        date_from: editForm.date_from,
        date_to:   editForm.date_to,
        reason:    editForm.reason || null,
      }),
    })
    const json = await res.json()
    setSavingEdit(false)
    if (!res.ok) { setEditError(json.error ?? 'Error al guardar'); return }
    setEditing(null)
    setMessage({ text: 'Ausencia actualizada', ok: true })
    await load()
  }

  async function deleteAbsence(id: string) {
    if (!confirm('¿Eliminar esta ausencia definitivamente?')) return
    const token = await getToken()
    await fetch(`/api/absences/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    await load()
  }

  const filtered = rows.filter(r =>
    !workerFilter || r.worker?.full_name?.toLowerCase().includes(workerFilter.toLowerCase())
  )
  const pendingCount = rows.filter(r => r.status === 'pending').length

  return (
    <>
      {/* Mensaje global */}
      {message && (
        <div className={cn(
          'flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium',
          message.ok
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            : 'bg-red-500/10 border border-red-500/20 text-red-400'
        )}>
          {message.ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {message.text}
        </div>
      )}

      {/* Filtros + botón crear */}
      <div className="card flex flex-wrap gap-3 items-center">
        <Filter size={15} className="text-zinc-500 flex-shrink-0" />
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                statusFilter === s ? 'bg-white text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200')}>
              {s === 'all' ? 'Todos' : ABSENCE_STATUS_LABELS[s]}
              {s === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Buscar trabajador…" value={workerFilter}
            onChange={e => setWorkerFilter(e.target.value)} className="input pl-8 py-1.5 text-sm w-44" />
        </div>
        <button onClick={openCreate}
          className="ml-auto btn-primary flex items-center gap-1.5 py-1.5 px-3 text-sm">
          <Plus size={14} />Nueva ausencia
        </button>
      </div>

      {/* Tabla */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <CalendarOff size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay solicitudes</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filtered.map(row => (
              <div key={row.id} className={cn(
                'px-5 py-4 flex flex-col gap-3 hover:bg-zinc-800/30 transition-colors',
                row.status === 'pending' && 'bg-amber-500/5'
              )}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  {/* Trabajador */}
                  <div className="flex items-center gap-3 min-w-0 sm:w-52">
                    <WorkerAvatar name={row.worker?.full_name ?? ''} avatar={row.worker?.avatar_url} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{row.worker?.full_name ?? '—'}</p>
                      <p className="text-xs text-zinc-500 capitalize">{ABSENCE_TYPE_LABELS[row.type]}</p>
                    </div>
                  </div>

                  {/* Fechas + motivo */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-zinc-200">{formatDate(row.date_from)}</span>
                      {row.date_from !== row.date_to && (
                        <><span className="text-zinc-600">→</span>
                        <span className="text-sm font-medium text-zinc-200">{formatDate(row.date_to)}</span></>
                      )}
                      <span className="badge-gray">{dayCount(row.date_from, row.date_to)} día{dayCount(row.date_from, row.date_to) > 1 ? 's' : ''}</span>
                    </div>
                    {row.reason && <p className="text-xs text-zinc-500 mt-1 truncate">{row.reason}</p>}
                    {row.review_notes && row.status !== 'pending' && (
                      <p className="text-xs text-zinc-600 mt-1 italic truncate">Revisión: {row.review_notes}</p>
                    )}
                  </div>

                  {/* Estado + acciones */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={STATUS_CONFIG[row.status].classes}>
                      {row.status === 'pending'  && <Clock size={10} />}
                      {row.status === 'approved' && <CheckCircle2 size={10} />}
                      {row.status === 'rejected' && <XCircle size={10} />}
                      {STATUS_CONFIG[row.status].label}
                    </span>
                    {row.document_url && (
                      <a href={row.document_url} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800" title="Ver justificante">
                        <FileText size={15} />
                      </a>
                    )}
                    {row.status === 'pending' && (
                      <button onClick={() => { setReviewing(row); setReviewNote(''); setAdminNoteReview(row.admin_note ?? ''); setDocFile(null); setDocUploadError('') }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
                        <MessageSquare size={12} />Revisar<ChevronDown size={11} />
                      </button>
                    )}
                    <button
                      onClick={() => { setEditing(row); setEditForm({ type: row.type, date_from: row.date_from, date_to: row.date_to, reason: row.reason ?? '' }); setEditError(''); setDocFile(null); setDocUploadError('') }}
                      className="p-1.5 rounded-lg text-zinc-600 hover:text-blue-400 hover:bg-zinc-800 transition-colors" title="Editar ausencia"
                    >
                      <Edit2 size={15} />
                    </button>
                    {/* Botón añadir/editar nota admin */}
                    <button
                      onClick={() => { setEditingNoteId(row.id); setInlineNote(row.admin_note ?? '') }}
                      className={cn('p-1.5 rounded-lg transition-colors',
                        row.admin_note
                          ? 'text-blue-400 hover:text-blue-300 hover:bg-zinc-800'
                          : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800'
                      )}
                      title={row.admin_note ? 'Editar nota admin' : 'Añadir nota admin'}
                    >
                      <StickyNote size={15} />
                    </button>
                    <button onClick={() => deleteAbsence(row.id)}
                      className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors" title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Nota admin inline — editar o mostrar */}
                {editingNoteId === row.id ? (
                  <div className="flex items-center gap-2 pl-0 sm:pl-[13.5rem]">
                    <StickyNote size={13} className="text-blue-400 flex-shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={inlineNote}
                      onChange={e => setInlineNote(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveInlineNote(row.id); if (e.key === 'Escape') setEditingNoteId(null) }}
                      placeholder="Nota interna del admin…"
                      className="input flex-1 py-1.5 text-sm"
                    />
                    <button onClick={() => saveInlineNote(row.id)} disabled={savingNote}
                      className="p-1.5 text-emerald-400 hover:text-emerald-300 rounded-lg">
                      {savingNote ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    </button>
                    <button onClick={() => setEditingNoteId(null)} className="p-1.5 text-zinc-500 hover:text-white rounded-lg">
                      <X size={14} />
                    </button>
                  </div>
                ) : row.admin_note ? (
                  <div className="flex items-start gap-2 pl-0 sm:pl-[13.5rem]">
                    <StickyNote size={12} className="text-blue-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-300/80 italic">{row.admin_note}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal: revisar solicitud ── */}
      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setReviewing(null)} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-5 animate-slide-up">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Revisar solicitud</h2>
                <p className="text-sm text-zinc-500 mt-0.5">{reviewing.worker?.full_name} · {ABSENCE_TYPE_LABELS[reviewing.type]}</p>
              </div>
              <button onClick={() => setReviewing(null)} className="p-1.5 text-zinc-500 hover:text-white rounded-lg"><X size={18} /></button>
            </div>

            <div className="bg-zinc-800 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-zinc-500">Tipo</span><span className="text-white font-medium">{ABSENCE_TYPE_LABELS[reviewing.type]}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Desde</span><span className="text-white font-medium">{formatDate(reviewing.date_from)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Hasta</span><span className="text-white font-medium">{formatDate(reviewing.date_to)}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500">Días</span><span className="text-white font-medium">{dayCount(reviewing.date_from, reviewing.date_to)}</span></div>
              {reviewing.reason && (
                <div className="pt-2 border-t border-zinc-700">
                  <span className="text-zinc-500 block mb-1">Motivo del trabajador</span>
                  <span className="text-zinc-300">{reviewing.reason}</span>
                </div>
              )}
              {/* Documento actual + opción de subir */}
              <div className="pt-2 border-t border-zinc-700 space-y-2">
                {reviewing.document_url ? (
                  <a href={reviewing.document_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300">
                    <FileText size={14} />Ver justificante<ExternalLink size={12} />
                  </a>
                ) : (
                  <p className="text-xs text-zinc-600 italic">Sin justificante adjunto</p>
                )}
                {/* Upload de documento desde el modal de revisión */}
                <div className="flex items-center gap-2 pt-1">
                  <label className="flex-1 flex items-center gap-2 cursor-pointer border border-zinc-700 hover:border-zinc-500 rounded-xl px-3 py-2 transition-colors group">
                    <Paperclip size={13} className="text-zinc-500 group-hover:text-zinc-300 flex-shrink-0 transition-colors" />
                    <span className="text-xs text-zinc-400 truncate">
                      {docFile ? docFile.name : reviewing.document_url ? 'Reemplazar documento…' : 'Adjuntar documento…'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                      className="hidden"
                      onChange={e => { setDocFile(e.target.files?.[0] ?? null); setDocUploadError('') }}
                    />
                  </label>
                  {docFile && (
                    <button
                      onClick={() => uploadDocument(reviewing.id, reviewing.worker_id)}
                      disabled={uploadingDoc}
                      className="btn-primary py-2 px-3 text-xs gap-1.5 flex items-center flex-shrink-0"
                    >
                      {uploadingDoc ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      Subir
                    </button>
                  )}
                </div>
                {docUploadError && (
                  <p className="text-xs text-red-400 flex items-center gap-1.5">
                    <XCircle size={13} />{docUploadError}
                  </p>
                )}
                <p className="text-xs text-zinc-700">PDF, imagen o Word · Máx. 10 MB</p>
              </div>
            </div>

            <div>
              <label className="section-title mb-1.5 block">Nota de revisión (visible para el trabajador)</label>
              <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)}
                placeholder="Motivo de rechazo, observaciones…" rows={2} className="input w-full resize-none text-sm" />
            </div>

            <div>
              <label className="section-title mb-1.5 block flex items-center gap-1.5">
                <StickyNote size={12} />Nota interna admin (solo visible para admins)
              </label>
              <textarea value={adminNoteReview} onChange={e => setAdminNoteReview(e.target.value)}
                placeholder="Notas internas, contexto, gestión…" rows={2} className="input w-full resize-none text-sm" />
            </div>

            {message && !message.ok && <p className="text-sm text-red-400">{message.text}</p>}

            <div className="flex gap-3">
              <button onClick={() => submitReview('rejected')} disabled={saving}
                className="flex-1 btn-danger flex items-center justify-center gap-2">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}Rechazar
              </button>
              <button onClick={() => submitReview('approved')} disabled={saving}
                className="flex-1 btn-primary flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}Aprobar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: editar ausencia (admin) ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-5 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Editar ausencia</h2>
                <p className="text-sm text-zinc-500 mt-0.5">{editing.worker?.full_name}</p>
              </div>
              <button onClick={() => setEditing(null)} className="p-1.5 text-zinc-500 hover:text-white rounded-lg"><X size={18} /></button>
            </div>

            {/* Tipo */}
            <div>
              <label className="section-title mb-2 block">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(ABSENCE_TYPE_LABELS) as [keyof typeof ABSENCE_TYPE_LABELS, string][]).map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setEditForm(f => ({ ...f, type: val }))}
                    className={cn('px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all border',
                      editForm.type === val
                        ? 'bg-white text-zinc-950 border-white'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-200'
                    )}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="section-title mb-1.5 block">Desde</label>
                <input type="date" value={editForm.date_from}
                  onChange={e => setEditForm(f => ({ ...f, date_from: e.target.value }))}
                  className="input w-full text-sm" required />
              </div>
              <div>
                <label className="section-title mb-1.5 block">Hasta</label>
                <input type="date" value={editForm.date_to} min={editForm.date_from}
                  onChange={e => setEditForm(f => ({ ...f, date_to: e.target.value }))}
                  className="input w-full text-sm" required />
              </div>
            </div>

            {/* Motivo */}
            <div>
              <label className="section-title mb-1.5 block">Motivo <span className="text-zinc-600 normal-case font-normal">(opcional)</span></label>
              <textarea value={editForm.reason} onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Motivo de la ausencia…" rows={2} className="input w-full resize-none text-sm" />
            </div>

            {/* ── Documento / Justificante ── */}
            <div className="border-t border-zinc-800 pt-4 space-y-3">
              <label className="section-title flex items-center gap-1.5">
                <Paperclip size={12} />
                Justificante / Documento
              </label>

              {/* Documento actual */}
              {editing.document_url && (
                <a
                  href={editing.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <FileText size={14} />
                  <span className="truncate">Ver documento actual</span>
                  <ExternalLink size={12} className="flex-shrink-0" />
                </a>
              )}

              {/* Selector de archivo */}
              <div className="flex items-center gap-2">
                <label className="flex-1 flex items-center gap-2.5 cursor-pointer border border-zinc-700 hover:border-zinc-500 rounded-xl px-3 py-2.5 transition-colors group">
                  <Upload size={14} className="text-zinc-500 group-hover:text-zinc-300 flex-shrink-0 transition-colors" />
                  <span className="text-sm text-zinc-400 truncate min-w-0">
                    {docFile ? docFile.name : editing.document_url ? 'Reemplazar documento…' : 'Subir documento…'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    className="hidden"
                    onChange={e => { setDocFile(e.target.files?.[0] ?? null); setDocUploadError('') }}
                  />
                </label>
                {docFile && (
                  <button
                    onClick={() => uploadDocument(editing.id, editing.worker_id)}
                    disabled={uploadingDoc}
                    className="btn-primary py-2.5 px-4 text-sm gap-2 flex items-center flex-shrink-0"
                  >
                    {uploadingDoc
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Upload size={14} />}
                    Subir
                  </button>
                )}
                {docFile && !uploadingDoc && (
                  <button
                    onClick={() => setDocFile(null)}
                    className="p-2 text-zinc-600 hover:text-red-400 rounded-lg transition-colors flex-shrink-0"
                    title="Cancelar selección"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <p className="text-xs text-zinc-600">PDF, imagen o Word · Máx. 10 MB</p>

              {docUploadError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5">
                  <XCircle size={13} />{docUploadError}
                </p>
              )}
            </div>

            {editError && <p className="text-sm text-red-400 flex items-center gap-1.5"><XCircle size={14} />{editError}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditing(null)} className="flex-1 btn-secondary">Cancelar</button>
              <button onClick={submitEdit} disabled={savingEdit}
                className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                {savingEdit ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Guardar cambios
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: crear ausencia (admin) ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowCreate(false)} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-5 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Nueva ausencia</h2>
                <p className="text-sm text-zinc-500 mt-0.5">Crear en nombre de un trabajador</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-1.5 text-zinc-500 hover:text-white rounded-lg"><X size={18} /></button>
            </div>

            {/* Trabajador */}
            <div>
              <label className="section-title mb-1.5 block">Trabajador</label>
              <select value={createForm.worker_id} onChange={e => setCreateForm(f => ({ ...f, worker_id: e.target.value }))}
                className="input w-full text-sm">
                <option value="">Seleccionar trabajador…</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
              </select>
            </div>

            {/* Tipo */}
            <div>
              <label className="section-title mb-2 block">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(ABSENCE_TYPE_LABELS) as [keyof typeof ABSENCE_TYPE_LABELS, string][]).map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setCreateForm(f => ({ ...f, type: val }))}
                    className={cn('px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all border',
                      createForm.type === val
                        ? 'bg-white text-zinc-950 border-white'
                        : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-200'
                    )}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="section-title mb-1.5 block">Desde</label>
                <input type="date" value={createForm.date_from}
                  onChange={e => { setCreateForm(f => ({ ...f, date_from: e.target.value, date_to: e.target.value < f.date_to ? f.date_to : e.target.value })) }}
                  className="input w-full text-sm" required />
              </div>
              <div>
                <label className="section-title mb-1.5 block">Hasta</label>
                <input type="date" value={createForm.date_to} min={createForm.date_from}
                  onChange={e => setCreateForm(f => ({ ...f, date_to: e.target.value }))}
                  className="input w-full text-sm" required />
              </div>
            </div>

            {/* Motivo */}
            <div>
              <label className="section-title mb-1.5 block">Motivo <span className="text-zinc-600 normal-case font-normal">(opcional)</span></label>
              <textarea value={createForm.reason} onChange={e => setCreateForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Descripción de la ausencia…" rows={2} className="input w-full resize-none text-sm" />
            </div>

            {/* Nota interna */}
            <div>
              <label className="section-title mb-1.5 block flex items-center gap-1.5">
                <StickyNote size={12} />Nota interna admin <span className="text-zinc-600 normal-case font-normal">(solo admins)</span>
              </label>
              <textarea value={createForm.admin_note} onChange={e => setCreateForm(f => ({ ...f, admin_note: e.target.value }))}
                placeholder="Contexto, notas de gestión…" rows={2} className="input w-full resize-none text-sm" />
            </div>

            {/* Aprobar directamente */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" checked={createForm.pre_approved}
                onChange={e => setCreateForm(f => ({ ...f, pre_approved: e.target.checked }))}
                className="w-4 h-4 rounded accent-emerald-500" />
              <div>
                <p className="text-sm font-medium text-zinc-200">Crear como ya aprobada</p>
                <p className="text-xs text-zinc-500">Se marcará como aprobada sin pasar por pendiente</p>
              </div>
            </label>

            {createError && (
              <p className="text-sm text-red-400 flex items-center gap-1.5">
                <XCircle size={14} />{createError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowCreate(false)} className="flex-1 btn-secondary">Cancelar</button>
              <button onClick={submitCreate} disabled={creating || !createForm.worker_id}
                className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-40">
                {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                {createForm.pre_approved ? 'Crear y aprobar' : 'Crear pendiente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// TAB: SALDOS POR TRABAJADOR
// ══════════════════════════════════════════════════════════════════════════

function TabSaldos() {
  const supabase = createClient()
  const [year, setYear]         = useState(new Date().getFullYear())
  const [balances, setBalances] = useState<WorkerBalance[]>([])
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState<string | null>(null)   // worker_id en edición
  const [editVac, setEditVac]   = useState(0)
  const [editPer, setEditPer]   = useState(0)
  const [saving, setSaving]     = useState(false)
  const [search, setSearch]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    const res = await fetch(`/api/absence-allowances?year=${year}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const json = await res.json()
    setBalances(json.data ?? [])
    setLoading(false)
  }, [supabase, year])

  useEffect(() => { load() }, [load])

  function startEdit(b: WorkerBalance) {
    setEditing(b.worker_id)
    setEditVac(b.vacation_total)
    setEditPer(b.personal_total)
  }

  async function saveEdit(workerId: string) {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    await fetch('/api/absence-allowances', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ worker_id: workerId, year, vacation_days: editVac, personal_days: editPer }),
    })
    setSaving(false)
    setEditing(null)
    await load()
  }

  const filtered = balances.filter(b =>
    !search || b.worker?.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i)

  return (
    <>
      {/* Controles */}
      <div className="card flex flex-wrap gap-3 items-center">
        <BarChart3 size={15} className="text-zinc-500" />
        <span className="text-sm text-zinc-400">Año</span>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input w-auto py-1.5 text-sm">
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)}
            className="input pl-8 py-1.5 text-sm w-48" />
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 px-1">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/50 inline-block" />Vacaciones (días naturales)</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-500/50 inline-block" />Asuntos propios</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500/50 inline-block" />Baja / Enfermedad</span>
      </div>

      {/* Tabla saldos */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <BarChart3 size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay trabajadores</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Trabajador</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-blue-400/70 uppercase tracking-wider" colSpan={3}>Vacaciones</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-purple-400/70 uppercase tracking-wider" colSpan={3}>Asuntos propios</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-amber-400/70 uppercase tracking-wider">Bajas</th>
                    <th className="px-3 py-3"></th>
                  </tr>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50">
                    <th className="px-5 py-2" />
                    <th className="text-center px-3 py-2 text-[10px] text-zinc-600 font-medium uppercase">Total</th>
                    <th className="text-center px-3 py-2 text-[10px] text-zinc-600 font-medium uppercase">Usados</th>
                    <th className="text-center px-3 py-2 text-[10px] text-zinc-600 font-medium uppercase">Quedan</th>
                    <th className="text-center px-3 py-2 text-[10px] text-zinc-600 font-medium uppercase">Total</th>
                    <th className="text-center px-3 py-2 text-[10px] text-zinc-600 font-medium uppercase">Usados</th>
                    <th className="text-center px-3 py-2 text-[10px] text-zinc-600 font-medium uppercase">Quedan</th>
                    <th className="text-center px-3 py-2 text-[10px] text-zinc-600 font-medium uppercase">Días</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => {
                    const isEditing = editing === b.worker_id
                    return (
                      <tr key={b.worker_id} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <WorkerAvatar name={b.worker.full_name} avatar={b.worker.avatar_url} size="sm" />
                            <span className="text-zinc-200 font-medium">{b.worker.full_name}</span>
                          </div>
                        </td>

                        {/* Vacaciones */}
                        <td className="px-3 py-3.5 text-center">
                          {isEditing
                            ? <input type="number" min={0} max={365} value={editVac} onChange={e => setEditVac(Number(e.target.value))}
                                className="w-14 text-center bg-zinc-800 border border-zinc-600 rounded-lg px-1 py-0.5 text-white text-sm" />
                            : <span className="font-mono text-zinc-400">{b.vacation_total}</span>
                          }
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <span className={cn('font-mono', b.vacation_used > 0 ? 'text-blue-300' : 'text-zinc-600')}>{b.vacation_used}</span>
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <span className={cn('font-semibold font-mono', b.vacation_remaining < 0 ? 'text-red-400' : b.vacation_remaining === 0 ? 'text-zinc-500' : 'text-emerald-400')}>
                            {b.vacation_remaining}
                          </span>
                        </td>

                        {/* Asuntos propios */}
                        <td className="px-3 py-3.5 text-center">
                          {isEditing
                            ? <input type="number" min={0} max={365} value={editPer} onChange={e => setEditPer(Number(e.target.value))}
                                className="w-14 text-center bg-zinc-800 border border-zinc-600 rounded-lg px-1 py-0.5 text-white text-sm" />
                            : <span className="font-mono text-zinc-400">{b.personal_total}</span>
                          }
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <span className={cn('font-mono', b.personal_used > 0 ? 'text-purple-300' : 'text-zinc-600')}>{b.personal_used}</span>
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <span className={cn('font-semibold font-mono', b.personal_remaining < 0 ? 'text-red-400' : b.personal_remaining === 0 ? 'text-zinc-500' : 'text-emerald-400')}>
                            {b.personal_remaining}
                          </span>
                        </td>

                        {/* Bajas */}
                        <td className="px-3 py-3.5 text-center">
                          <span className={cn('font-mono', b.sick_used > 0 ? 'text-amber-300' : 'text-zinc-600')}>{b.sick_used}</span>
                        </td>

                        {/* Acciones */}
                        <td className="px-3 py-3.5 text-right">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5 justify-end">
                              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800">
                                <X size={14} />
                              </button>
                              <button onClick={() => saveEdit(b.worker_id)} disabled={saving}
                                className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-zinc-800">
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                              </button>
                            </div>
                          ) : (
                            <button onClick={() => startEdit(b)}
                              className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
                              <Edit2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-zinc-800">
              {filtered.map(b => {
                const isEditing = editing === b.worker_id
                return (
                  <div key={b.worker_id} className="px-4 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <WorkerAvatar name={b.worker.full_name} avatar={b.worker.avatar_url} size="sm" />
                        <span className="text-sm font-semibold text-zinc-200">{b.worker.full_name}</span>
                      </div>
                      {isEditing ? (
                        <div className="flex gap-1.5">
                          <button onClick={() => setEditing(null)} className="p-1.5 text-zinc-500 hover:text-white rounded-lg"><X size={14} /></button>
                          <button onClick={() => saveEdit(b.worker_id)} disabled={saving} className="p-1.5 text-emerald-400 rounded-lg">
                            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(b)} className="p-1.5 text-zinc-600 hover:text-zinc-300 rounded-lg"><Edit2 size={14} /></button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <BalanceMini label="Vacaciones" total={isEditing ? editVac : b.vacation_total} used={b.vacation_used}
                        remaining={isEditing ? editVac - b.vacation_used : b.vacation_remaining}
                        color="blue" editing={isEditing} onEdit={v => setEditVac(v)} />
                      <BalanceMini label="As. propios" total={isEditing ? editPer : b.personal_total} used={b.personal_used}
                        remaining={isEditing ? editPer - b.personal_used : b.personal_remaining}
                        color="purple" editing={isEditing} onEdit={v => setEditPer(v)} />
                      <div className="bg-zinc-800 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-amber-400/70 font-semibold uppercase mb-1">Bajas</p>
                        <p className={cn('text-xl font-bold', b.sick_used > 0 ? 'text-amber-300' : 'text-zinc-600')}>{b.sick_used}</p>
                        <p className="text-[10px] text-zinc-600 mt-0.5">días</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Sub-componentes ────────────────────────────────────────────────────────

function WorkerAvatar({ name, avatar, size = 'md' }: { name: string; avatar: string | null; size?: 'sm' | 'md' }) {
  const sz = size === 'sm' ? 'w-7 h-7 text-[10px]' : 'w-9 h-9 text-xs'
  if (avatar) return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatar} alt="" className={cn(sz, 'rounded-full object-cover flex-shrink-0 border border-zinc-700')} />
  )
  return (
    <div className={cn(sz, 'rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold', avatarColor(name))}>
      {initials(name)}
    </div>
  )
}

function BalanceMini({ label, total, used, remaining, color, editing, onEdit }: {
  label: string; total: number; used: number; remaining: number
  color: 'blue' | 'purple'; editing: boolean; onEdit: (v: number) => void
}) {
  const colors = {
    blue:   { label: 'text-blue-400/70',   rem: remaining < 0 ? 'text-red-400' : remaining === 0 ? 'text-zinc-500' : 'text-emerald-400' },
    purple: { label: 'text-purple-400/70', rem: remaining < 0 ? 'text-red-400' : remaining === 0 ? 'text-zinc-500' : 'text-emerald-400' },
  }
  return (
    <div className="bg-zinc-800 rounded-xl p-3 text-center">
      <p className={cn('text-[10px] font-semibold uppercase mb-1', colors[color].label)}>{label}</p>
      {editing
        ? <input type="number" min={0} max={365} value={total} onChange={e => onEdit(Number(e.target.value))}
            className="w-full text-center bg-zinc-700 border border-zinc-600 rounded px-1 py-0.5 text-white text-sm mb-1" />
        : <p className="text-xl font-bold text-white">{total}</p>
      }
      <p className="text-[10px] text-zinc-500">{used} usados</p>
      <p className={cn('text-xs font-bold mt-0.5', colors[color].rem)}>{remaining} quedan</p>
    </div>
  )
}
