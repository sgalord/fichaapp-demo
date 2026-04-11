'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ABSENCE_TYPE_LABELS, ABSENCE_STATUS_LABELS,
  type Absence, type AbsenceType,
} from '@/types'
import { formatDate, todayISO } from '@/lib/utils'
import {
  ArrowLeft, CalendarOff, Plus, X, Loader2,
  CheckCircle2, XCircle, Clock, FileText, Upload, Trash2,
  AlertTriangle, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

const STATUS_CONFIG = {
  pending:  { label: 'Pendiente',  classes: 'badge-orange' },
  approved: { label: 'Aprobado',   classes: 'badge-green'  },
  rejected: { label: 'Rechazado',  classes: 'badge-red'    },
}

function dayCount(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000) + 1
}

export default function WorkerAusenciasPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [absences, setAbsences] = useState<Absence[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving]     = useState(false)
  const [message, setMessage]   = useState<{ text: string; ok: boolean } | null>(null)

  // Form state
  const [type, setType]         = useState<AbsenceType>('vacation')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [reason, setReason]     = useState('')
  const [docFile, setDocFile]   = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const res = await fetch('/api/absences', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const json = await res.json()
    setAbsences((json.data ?? []) as Absence[])
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  function openForm() {
    setType('vacation')
    setDateFrom(todayISO())
    setDateTo(todayISO())
    setReason('')
    setDocFile(null)
    setMessage(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setMessage(null)
  }

  async function uploadDocument(file: File, uid: string): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'pdf'
    const path = `${uid}/${Date.now()}.${ext}`
    const { error } = await supabase.storage
      .from('absence-documents')
      .upload(path, file, { contentType: file.type, upsert: false })
    if (error) return null
    const { data: { publicUrl } } = supabase.storage
      .from('absence-documents')
      .getPublicUrl(path)
    return publicUrl
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dateFrom || !dateTo) return
    if (dateTo < dateFrom) {
      setMessage({ text: 'La fecha de fin debe ser igual o posterior a la de inicio', ok: false })
      return
    }
    if (type === 'sick_leave' && !docFile) {
      setMessage({ text: 'Las bajas por enfermedad requieren justificante', ok: false })
      return
    }

    setSaving(true)
    setMessage(null)

    let document_url: string | null = null

    // Subir documento si existe
    if (docFile && userId) {
      setUploading(true)
      document_url = await uploadDocument(docFile, userId)
      setUploading(false)
      if (!document_url && type === 'sick_leave') {
        setMessage({ text: 'Error al subir el justificante. Inténtalo de nuevo.', ok: false })
        setSaving(false)
        return
      }
    }

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const res = await fetch('/api/absences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ type, date_from: dateFrom, date_to: dateTo, reason: reason || null, document_url }),
    })
    const json = await res.json()
    setSaving(false)

    if (!res.ok) {
      setMessage({ text: json.error ?? 'Error al enviar la solicitud', ok: false })
    } else {
      setMessage({ text: '¡Solicitud enviada! El administrador la revisará pronto.', ok: true })
      await load()
      setTimeout(() => closeForm(), 1800)
    }
  }

  async function cancelAbsence(id: string) {
    if (!confirm('¿Cancelar esta solicitud?')) return
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    await fetch(`/api/absences/${id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    await load()
  }

  // Agrupar por año
  const upcoming = absences.filter(a => a.date_from >= todayISO() || a.date_to >= todayISO())
  const past     = absences.filter(a => a.date_to < todayISO())

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-zinc-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 max-w-md mx-auto">

      {/* ── Header ── */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 pt-12 pb-4 safe-top sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/worker" className="p-2 -ml-2 text-zinc-500 hover:text-white transition-colors rounded-xl hover:bg-zinc-800">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 bg-amber-500/20 rounded-md flex items-center justify-center">
              <CalendarOff size={13} className="text-amber-400" strokeWidth={2} />
            </div>
            <h1 className="text-base font-bold text-white">Mis Ausencias</h1>
          </div>
          <button
            onClick={openForm}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-zinc-950 text-sm font-semibold hover:bg-zinc-200 transition-colors"
          >
            <Plus size={15} />
            Solicitar
          </button>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 pb-12">

        {/* ── Contador resumen ── */}
        {absences.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {(['pending', 'approved', 'rejected'] as const).map(s => {
              const count = absences.filter(a => a.status === s).length
              return (
                <div key={s} className="card text-center py-3">
                  <p className="text-2xl font-bold text-white">{count}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{ABSENCE_STATUS_LABELS[s]}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Próximas / Activas ── */}
        {upcoming.length > 0 && (
          <section className="space-y-2">
            <p className="section-title">Próximas y activas</p>
            {upcoming.map(a => (
              <AbsenceCard key={a.id} absence={a} onCancel={cancelAbsence} />
            ))}
          </section>
        )}

        {/* ── Pasadas ── */}
        {past.length > 0 && (
          <section className="space-y-2">
            <p className="section-title">Historial</p>
            {past.map(a => (
              <AbsenceCard key={a.id} absence={a} onCancel={cancelAbsence} />
            ))}
          </section>
        )}

        {absences.length === 0 && (
          <div className="text-center py-16 text-zinc-600">
            <CalendarOff size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No tienes solicitudes de ausencia</p>
            <button onClick={openForm} className="mt-4 btn-secondary text-sm flex items-center gap-1.5 mx-auto">
              <Plus size={14} /> Hacer una solicitud
            </button>
          </div>
        )}
      </main>

      {/* ── Modal: nueva solicitud ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={closeForm} />
          <div className="relative bg-zinc-900 border border-zinc-800 rounded-t-2xl w-full max-w-md p-5 space-y-5 animate-slide-up max-h-[90vh] overflow-y-auto">

            {/* Cabecera modal */}
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Nueva solicitud</h2>
              <button onClick={closeForm} className="p-1.5 text-zinc-500 hover:text-white rounded-lg">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Tipo */}
              <div>
                <label className="section-title mb-2 block">Tipo de ausencia</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(ABSENCE_TYPE_LABELS) as [AbsenceType, string][]).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setType(val)}
                      className={cn(
                        'px-3 py-2.5 rounded-xl text-sm font-medium text-left transition-all border',
                        type === val
                          ? 'bg-white text-zinc-950 border-white'
                          : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-600 hover:text-zinc-200'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="section-title mb-1.5 block">Desde</label>
                  <input
                    type="date"
                    value={dateFrom}
                    min={todayISO()}
                    onChange={e => {
                      setDateFrom(e.target.value)
                      if (dateTo < e.target.value) setDateTo(e.target.value)
                    }}
                    className="input w-full text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="section-title mb-1.5 block">Hasta</label>
                  <input
                    type="date"
                    value={dateTo}
                    min={dateFrom || todayISO()}
                    onChange={e => setDateTo(e.target.value)}
                    className="input w-full text-sm"
                    required
                  />
                </div>
              </div>

              {dateFrom && dateTo && (
                <p className="text-xs text-zinc-500 -mt-1">
                  {dayCount(dateFrom, dateTo)} día{dayCount(dateFrom, dateTo) > 1 ? 's' : ''} seleccionado{dayCount(dateFrom, dateTo) > 1 ? 's' : ''}
                </p>
              )}

              {/* Motivo */}
              <div>
                <label className="section-title mb-1.5 block">
                  Motivo {type !== 'sick_leave' && <span className="text-zinc-600 normal-case font-normal">(opcional)</span>}
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={type === 'sick_leave' ? 'Describe brevemente la baja…' : 'Describe el motivo…'}
                  rows={2}
                  className="input w-full resize-none text-sm"
                />
              </div>

              {/* Justificante */}
              <div>
                <label className="section-title mb-1.5 block">
                  Justificante
                  {type === 'sick_leave'
                    ? <span className="ml-1 text-red-400 normal-case font-normal">(obligatorio para bajas)</span>
                    : <span className="text-zinc-600 normal-case font-normal ml-1">(opcional)</span>
                  }
                </label>

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={e => setDocFile(e.target.files?.[0] ?? null)}
                />

                {docFile ? (
                  <div className="flex items-center gap-2.5 px-3 py-2.5 bg-zinc-800 rounded-xl border border-zinc-700">
                    <FileText size={16} className="text-blue-400 flex-shrink-0" />
                    <span className="text-sm text-zinc-300 flex-1 truncate">{docFile.name}</span>
                    <button type="button" onClick={() => setDocFile(null)} className="text-zinc-500 hover:text-red-400">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border border-dashed border-zinc-700 text-sm text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 transition-colors"
                  >
                    <Upload size={16} />
                    Subir foto o PDF
                  </button>
                )}
              </div>

              {/* Aviso baja médica */}
              {type === 'sick_leave' && (
                <div className="flex items-start gap-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                  <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">
                    Las bajas por enfermedad requieren justificante médico para ser aprobadas.
                  </p>
                </div>
              )}

              {/* Mensaje */}
              {message && (
                <div className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium',
                  message.ok
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                )}>
                  {message.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                  {message.text}
                </div>
              )}

              {/* Botón enviar */}
              <button
                type="submit"
                disabled={saving || !dateFrom || !dateTo}
                className="w-full btn-primary flex items-center justify-center gap-2 py-3 disabled:opacity-40"
              >
                {saving
                  ? <><Loader2 size={16} className="animate-spin" />{uploading ? 'Subiendo documento…' : 'Enviando…'}</>
                  : <><CheckCircle2 size={16} />Enviar solicitud</>
                }
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componente tarjeta de ausencia ─────────────────────────────────────────
function AbsenceCard({ absence, onCancel }: { absence: Absence; onCancel: (id: string) => void }) {
  return (
    <div className={cn(
      'card space-y-2.5',
      absence.status === 'pending' && 'border-amber-500/20 bg-amber-500/5'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">
              {ABSENCE_TYPE_LABELS[absence.type]}
            </span>
            <span className={STATUS_CONFIG[absence.status].classes}>
              {absence.status === 'pending'  && <Clock size={10} />}
              {absence.status === 'approved' && <CheckCircle2 size={10} />}
              {absence.status === 'rejected' && <XCircle size={10} />}
              {STATUS_CONFIG[absence.status].label}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">
            {formatDate(absence.date_from)}
            {absence.date_from !== absence.date_to && ` → ${formatDate(absence.date_to)}`}
            {' · '}
            <span className="font-medium">{dayCount(absence.date_from, absence.date_to)} día{dayCount(absence.date_from, absence.date_to) > 1 ? 's' : ''}</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {absence.document_url && (
            <a
              href={absence.document_url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg"
              title="Ver justificante"
            >
              <FileText size={15} />
            </a>
          )}
          {absence.status === 'pending' && (
            <button
              onClick={() => onCancel(absence.id)}
              className="p-1.5 text-zinc-600 hover:text-red-400 rounded-lg transition-colors"
              title="Cancelar solicitud"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {absence.reason && (
        <p className="text-xs text-zinc-500 leading-relaxed">{absence.reason}</p>
      )}

      {absence.review_notes && (
        <div className={cn(
          'text-xs px-3 py-2 rounded-lg',
          absence.status === 'rejected'
            ? 'bg-red-500/10 text-red-400'
            : 'bg-zinc-800 text-zinc-400'
        )}>
          <span className="font-medium">Nota admin: </span>{absence.review_notes}
        </div>
      )}
    </div>
  )
}
