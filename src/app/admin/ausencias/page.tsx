'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ABSENCE_TYPE_LABELS, ABSENCE_STATUS_LABELS,
  type Absence, type AbsenceStatus,
} from '@/types'
import { formatDate, initials, avatarColor, todayISO } from '@/lib/utils'
import {
  Loader2, Check, X, Search, CalendarOff, FileText,
  ChevronDown, Clock, CheckCircle2, XCircle, Filter,
  ExternalLink, Trash2, MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type AbsenceRow = Absence & {
  worker: { id: string; full_name: string; avatar_url: string | null }
}

const STATUS_CONFIG = {
  pending:  { label: 'Pendiente', classes: 'badge-orange' },
  approved: { label: 'Aprobado',  classes: 'badge-green'  },
  rejected: { label: 'Rechazado', classes: 'badge-red'    },
}

function dayCount(from: string, to: string) {
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.round(ms / 86400000) + 1
}

export default function AusenciasAdminPage() {
  const supabase = createClient()

  const [rows, setRows]         = useState<AbsenceRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [statusFilter, setStatusFilter] = useState<AbsenceStatus | 'all'>('pending')
  const [workerFilter, setWorkerFilter] = useState('')
  const [reviewing, setReviewing] = useState<AbsenceRow | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving]     = useState(false)
  const [message, setMessage]   = useState<{ text: string; ok: boolean } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const params = new URLSearchParams()
    if (statusFilter !== 'all') params.set('status', statusFilter)

    const res = await fetch(`/api/absences?${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const json = await res.json()
    setRows((json.data ?? []) as AbsenceRow[])
    setLoading(false)
  }, [supabase, statusFilter])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r =>
    !workerFilter || r.worker?.full_name?.toLowerCase().includes(workerFilter.toLowerCase())
  )

  async function submitReview(status: 'approved' | 'rejected') {
    if (!reviewing) return
    setSaving(true)
    setMessage(null)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const res = await fetch(`/api/absences/${reviewing.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ status, review_notes: reviewNote || null }),
    })
    const json = await res.json()
    setSaving(false)

    if (!res.ok) {
      setMessage({ text: json.error ?? 'Error al procesar', ok: false })
    } else {
      setMessage({ text: status === 'approved' ? 'Ausencia aprobada' : 'Ausencia rechazada', ok: true })
      setReviewing(null)
      setReviewNote('')
      await load()
    }
  }

  async function deleteAbsence(id: string) {
    if (!confirm('¿Eliminar esta ausencia definitivamente?')) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    await fetch(`/api/absences/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    await load()
  }

  const pendingCount = rows.filter(r => r.status === 'pending').length

  return (
    <div className="space-y-6">

      {/* ── Cabecera ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarOff size={20} className="text-amber-400" />
            Ausencias y Vacaciones
          </h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            Gestión de solicitudes de vacaciones, asuntos propios y bajas
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="badge-orange text-sm font-semibold px-3 py-1.5">
            {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Mensaje global ── */}
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

      {/* ── Filtros ── */}
      <div className="card flex flex-wrap gap-3 items-center">
        <Filter size={15} className="text-zinc-500 flex-shrink-0" />

        {/* Estado */}
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                statusFilter === s
                  ? 'bg-white text-zinc-950'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
              )}
            >
              {s === 'all' ? 'Todos' : ABSENCE_STATUS_LABELS[s]}
              {s === 'pending' && pendingCount > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-[10px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">
                  {pendingCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Buscar trabajador */}
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Buscar trabajador…"
            value={workerFilter}
            onChange={e => setWorkerFilter(e.target.value)}
            className="input pl-8 py-1.5 text-sm w-52"
          />
        </div>
      </div>

      {/* ── Tabla ── */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <CalendarOff size={36} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No hay solicitudes{statusFilter !== 'all' ? ` con estado "${ABSENCE_STATUS_LABELS[statusFilter as AbsenceStatus]}"` : ''}</p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filtered.map(row => (
              <div key={row.id} className={cn(
                'px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-zinc-800/30 transition-colors',
                row.status === 'pending' && 'bg-amber-500/5'
              )}>

                {/* Trabajador */}
                <div className="flex items-center gap-3 min-w-0 sm:w-52">
                  {row.worker?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.worker.avatar_url} alt=""
                      className="w-9 h-9 rounded-full object-cover flex-shrink-0 border border-zinc-700" />
                  ) : (
                    <div className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold',
                      avatarColor(row.worker?.full_name ?? '')
                    )}>
                      {initials(row.worker?.full_name ?? '')}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {row.worker?.full_name ?? '—'}
                    </p>
                    <p className="text-xs text-zinc-500 capitalize">
                      {ABSENCE_TYPE_LABELS[row.type]}
                    </p>
                  </div>
                </div>

                {/* Fechas + días */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-zinc-200">
                      {formatDate(row.date_from)}
                    </span>
                    {row.date_from !== row.date_to && (
                      <>
                        <span className="text-zinc-600">→</span>
                        <span className="text-sm font-medium text-zinc-200">
                          {formatDate(row.date_to)}
                        </span>
                      </>
                    )}
                    <span className="badge-gray">
                      {dayCount(row.date_from, row.date_to)} día{dayCount(row.date_from, row.date_to) > 1 ? 's' : ''}
                    </span>
                  </div>
                  {row.reason && (
                    <p className="text-xs text-zinc-500 mt-1 truncate">{row.reason}</p>
                  )}
                  {row.review_notes && row.status !== 'pending' && (
                    <p className="text-xs text-zinc-600 mt-1 italic truncate">
                      Nota: {row.review_notes}
                    </p>
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
                    <a
                      href={row.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                      title="Ver justificante"
                    >
                      <FileText size={15} />
                    </a>
                  )}

                  {row.status === 'pending' && (
                    <>
                      <button
                        onClick={() => { setReviewing(row); setReviewNote('') }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        <MessageSquare size={12} />
                        Revisar
                        <ChevronDown size={11} />
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => deleteAbsence(row.id)}
                    className="p-1.5 rounded-lg text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal de revisión ── */}
      {reviewing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setReviewing(null)} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 space-y-5 animate-slide-up">

            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Revisar solicitud</h2>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {reviewing.worker?.full_name} · {ABSENCE_TYPE_LABELS[reviewing.type]}
                </p>
              </div>
              <button onClick={() => setReviewing(null)} className="p-1.5 text-zinc-500 hover:text-white rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* Info de la solicitud */}
            <div className="bg-zinc-800 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Tipo</span>
                <span className="text-white font-medium">{ABSENCE_TYPE_LABELS[reviewing.type]}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Desde</span>
                <span className="text-white font-medium">{formatDate(reviewing.date_from)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Hasta</span>
                <span className="text-white font-medium">{formatDate(reviewing.date_to)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Días</span>
                <span className="text-white font-medium">{dayCount(reviewing.date_from, reviewing.date_to)}</span>
              </div>
              {reviewing.reason && (
                <div className="pt-2 border-t border-zinc-700">
                  <span className="text-zinc-500 block mb-1">Motivo</span>
                  <span className="text-zinc-300">{reviewing.reason}</span>
                </div>
              )}
              {reviewing.document_url && (
                <div className="pt-2 border-t border-zinc-700">
                  <a
                    href={reviewing.document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <FileText size={14} /> Ver justificante adjunto
                    <ExternalLink size={12} />
                  </a>
                </div>
              )}
            </div>

            {/* Nota del admin */}
            <div>
              <label className="section-title mb-1.5 block">Nota (opcional)</label>
              <textarea
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                placeholder="Motivo de rechazo, observaciones…"
                rows={2}
                className="input w-full resize-none text-sm"
              />
            </div>

            {/* Mensaje de error */}
            {message && !message.ok && (
              <p className="text-sm text-red-400">{message.text}</p>
            )}

            {/* Botones */}
            <div className="flex gap-3">
              <button
                onClick={() => submitReview('rejected')}
                disabled={saving}
                className="flex-1 btn-danger flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <X size={16} />}
                Rechazar
              </button>
              <button
                onClick={() => submitReview('approved')}
                disabled={saving}
                className="flex-1 btn-primary flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                Aprobar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
