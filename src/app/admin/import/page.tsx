'use client'

import { useState, useEffect } from 'react'
import { Loader2, CheckCircle2, AlertCircle, SkipForward, Users, HardHat, Play } from 'lucide-react'

type WorkerPreview = { full_name: string; username: string; email: string; phone: string }
type ObraPreview   = { name: string; address: string }
type ImportResult  = { name: string; status: 'created' | 'skipped' | 'error'; detail?: string }

export default function ImportPage() {
  const [workers, setWorkers]     = useState<WorkerPreview[]>([])
  const [obras, setObras]         = useState<ObraPreview[]>([])
  const [loading, setLoading]     = useState(true)
  const [importing, setImporting] = useState(false)
  const [results, setResults]     = useState<ImportResult[] | null>(null)
  const [obraResults, setObraResults] = useState<{ name: string; status: string }[] | null>(null)

  useEffect(() => {
    fetch('/api/admin/import-workers')
      .then(r => r.json())
      .then(({ workers, obras }) => { setWorkers(workers); setObras(obras) })
      .finally(() => setLoading(false))
  }, [])

  async function runImport() {
    if (!confirm('¿Confirmas la importación de todos los trabajadores y obras?')) return
    setImporting(true)
    const res  = await fetch('/api/admin/import-workers', { method: 'POST' })
    const json = await res.json()
    setResults(json.results ?? [])
    setObraResults(json.obras ?? [])
    setImporting(false)
  }

  const created = results?.filter(r => r.status === 'created').length ?? 0
  const skipped = results?.filter(r => r.status === 'skipped').length ?? 0
  const errors  = results?.filter(r => r.status === 'error').length ?? 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-white">Importar trabajadores</h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          Datos extraídos de la planilla de personal. Contraseña por defecto: <code className="text-zinc-300 bg-zinc-800 px-1.5 py-0.5 rounded text-xs">Built2026!</code>
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
      ) : (
        <>
          {/* Obras */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <HardHat size={15} className="text-amber-400" />
              <h2 className="text-sm font-semibold text-zinc-300">{obras.length} obras a importar</h2>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {obras.map(o => (
                <div key={o.name} className="bg-zinc-800/50 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-amber-300">{o.name}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{o.address}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Workers */}
          <div className="card">
            <div className="flex items-center gap-2 mb-3">
              <Users size={15} className="text-zinc-400" />
              <h2 className="text-sm font-semibold text-zinc-300">{workers.length} trabajadores a importar</h2>
            </div>
            <div className="space-y-1.5">
              {workers.map((w, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-zinc-800/60 last:border-0">
                  <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-300 flex-shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200">{w.full_name}</p>
                    <p className="text-xs text-zinc-500">
                      <span className="text-zinc-400">@{w.username}</span>
                      {' · '}{w.phone}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Results */}
          {results && (
            <div className="card">
              <h2 className="text-sm font-semibold text-zinc-300 mb-3">Resultado de la importación</h2>
              <div className="flex gap-4 mb-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 size={16} />
                  <span className="text-sm font-medium">{created} creados</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-500">
                  <SkipForward size={16} />
                  <span className="text-sm font-medium">{skipped} omitidos</span>
                </div>
                {errors > 0 && (
                  <div className="flex items-center gap-2 text-red-400">
                    <AlertCircle size={16} />
                    <span className="text-sm font-medium">{errors} errores</span>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2.5 py-1">
                    {r.status === 'created' && <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />}
                    {r.status === 'skipped' && <SkipForward  size={14} className="text-zinc-600 flex-shrink-0" />}
                    {r.status === 'error'   && <AlertCircle  size={14} className="text-red-400 flex-shrink-0" />}
                    <span className={`text-sm ${r.status === 'created' ? 'text-zinc-300' : r.status === 'error' ? 'text-red-400' : 'text-zinc-600'}`}>
                      {r.name}
                    </span>
                    {r.detail && <span className="text-xs text-zinc-600">({r.detail})</span>}
                  </div>
                ))}
              </div>
              {obraResults && (
                <div className="mt-4 pt-3 border-t border-zinc-800">
                  <p className="text-xs font-semibold text-zinc-500 mb-2">Obras:</p>
                  <div className="flex flex-wrap gap-2">
                    {obraResults.map((o, i) => (
                      <span key={i} className={`text-xs px-2 py-1 rounded-lg border ${
                        o.status === 'created' ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                        : o.status === 'error' ? 'border-red-500/30 text-red-400 bg-red-500/10'
                        : 'border-zinc-700 text-zinc-600'
                      }`}>
                        {o.name} · {o.status === 'created' ? 'creada' : o.status === 'skipped' ? 'ya existía' : 'error'}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!results && (
            <button onClick={runImport} disabled={importing} className="btn-primary w-full gap-2 py-4">
              {importing
                ? <><Loader2 size={16} className="animate-spin" />Importando...</>
                : <><Play size={16} />Ejecutar importación</>
              }
            </button>
          )}
        </>
      )}
    </div>
  )
}
