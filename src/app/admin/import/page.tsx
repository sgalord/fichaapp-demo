'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import {
  Upload, FileSpreadsheet, Users, HardHat, CheckCircle2,
  XCircle, AlertTriangle, Download, Loader2, Trash2, Eye,
} from 'lucide-react'

interface WorkerRow { full_name: string; phone: string }
interface ObraRow   { name: string; address: string }

interface ImportResult {
  full_name: string
  email: string
  username: string
  password: string
  status: 'created' | 'skipped'
  error?: string
}

type Step = 'upload' | 'preview' | 'done'

// Normaliza texto de celda a string limpio
function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

export default function ImportPage() {
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep]             = useState<Step>('upload')
  const [fileName, setFileName]     = useState('')
  const [workers, setWorkers]       = useState<WorkerRow[]>([])
  const [obras, setObras]           = useState<ObraRow[]>([])
  const [emailDomain, setEmailDomain] = useState('built.work')
  const [importing, setImporting]   = useState(false)
  const [results, setResults]       = useState<ImportResult[]>([])
  const [obraResults, setObraResults] = useState<{ name: string; status: string }[]>([])
  const [parseError, setParseError] = useState('')

  // ── Parsear Excel ────────────────────────────────────────────────────────
  function handleFile(file: File) {
    setParseError('')
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })

        // Hoja trabajadores: primera hoja del libro, o la llamada "Trabajadores"
        const workerSheetName =
          wb.SheetNames.find(n => n.toLowerCase().includes('trabajador')) ??
          wb.SheetNames[0]
        const workerSheet = wb.Sheets[workerSheetName]
        const rawWorkers  = XLSX.utils.sheet_to_json<Record<string, unknown>>(workerSheet, { defval: '' })

        const parsedWorkers: WorkerRow[] = rawWorkers
          .map(row => {
            // Detectar columnas flexiblemente (case-insensitive)
            const keys = Object.keys(row)
            const get  = (...candidates: string[]) => {
              for (const c of candidates) {
                const k = keys.find(k => k.toLowerCase().includes(c.toLowerCase()))
                if (k) return cellStr(row[k])
              }
              return ''
            }
            const nombre   = get('nombre', 'name', 'first')
            const apellido = get('apellido', 'surname', 'last')
            const phone    = get('telefono', 'teléfono', 'phone', 'tel', 'móvil', 'movil')
            const full_name = apellido ? `${nombre} ${apellido}`.trim() : nombre
            return { full_name, phone }
          })
          .filter(w => w.full_name.length >= 2)

        if (parsedWorkers.length === 0) {
          setParseError('No se encontraron trabajadores válidos. Asegúrate de que el Excel tiene columnas "Nombre" y "Apellido".')
          return
        }

        // Hoja obras (opcional): la llamada "Obras"
        const obraSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('obra'))
        const parsedObras: ObraRow[] = []
        if (obraSheetName) {
          const obraSheet = wb.Sheets[obraSheetName]
          const rawObras  = XLSX.utils.sheet_to_json<Record<string, unknown>>(obraSheet, { defval: '' })
          for (const row of rawObras) {
            const keys = Object.keys(row)
            const get  = (...candidates: string[]) => {
              for (const c of candidates) {
                const k = keys.find(k => k.toLowerCase().includes(c.toLowerCase()))
                if (k) return cellStr(row[k])
              }
              return ''
            }
            const name    = get('nombre', 'name', 'obra')
            const address = get('dirección', 'direccion', 'address')
            if (name) parsedObras.push({ name, address })
          }
        }

        setWorkers(parsedWorkers)
        setObras(parsedObras)
        setFileName(file.name)
        setStep('preview')
      } catch {
        setParseError('No se pudo leer el archivo. Asegúrate de que es un Excel válido (.xlsx o .xls).')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function removeWorker(i: number) {
    setWorkers(prev => prev.filter((_, idx) => idx !== i))
  }

  // ── Ejecutar importación ────────────────────────────────────────────────
  async function runImport() {
    setImporting(true)
    try {
      const res = await fetch('/api/admin/import-workers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workers, obras, email_domain: emailDomain }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Error en la importación')
      setResults(json.data.workers)
      setObraResults(json.data.obras)
      setStep('done')
    } catch (e: unknown) {
      setParseError(e instanceof Error ? e.message : 'Error inesperado')
    } finally {
      setImporting(false)
    }
  }

  // ── Exportar resultados a Excel ─────────────────────────────────────────
  function exportResults() {
    const data = results.map(r => ({
      'Nombre':       r.full_name,
      'Usuario':      r.username,
      'Email':        r.email,
      'Contraseña':   r.password || '(ya existía)',
      'Estado':       r.status === 'created' ? 'Creado' : 'Omitido',
      'Nota':         r.error ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = Object.keys(data[0] ?? {}).map(k => ({ wch: Math.max(k.length, 18) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Resultados')
    XLSX.writeFile(wb, `FichaApp-importacion-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  // ── Descargar plantilla ──────────────────────────────────────────────────
  function downloadTemplate() {
    const wsWorkers = XLSX.utils.aoa_to_sheet([
      ['Nombre', 'Apellido', 'Teléfono'],
      ['Juan', 'García López', '+34600000001'],
      ['María', 'Martínez', '+34600000002'],
    ])
    const wsObras = XLSX.utils.aoa_to_sheet([
      ['Nombre', 'Dirección'],
      ['Obra Centro', 'Calle Mayor 1, Madrid'],
      ['Obra Norte', 'Av. de la Paz 5, Barcelona'],
    ])
    wsWorkers['!cols'] = [{ wch: 20 }, { wch: 25 }, { wch: 18 }]
    wsObras['!cols']   = [{ wch: 20 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsWorkers, 'Trabajadores')
    XLSX.utils.book_append_sheet(wb, wsObras, 'Obras')
    XLSX.writeFile(wb, 'FichaApp-plantilla-importacion.xlsx')
  }

  const created = results.filter(r => r.status === 'created').length
  const skipped = results.filter(r => r.status === 'skipped').length

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Importar trabajadores</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Carga un Excel para crear trabajadores y obras en bloque</p>
        </div>
        <button onClick={downloadTemplate} className="btn-secondary gap-2 text-sm">
          <Download size={14} />
          Descargar plantilla
        </button>
      </div>

      {/* ── PASO 1: Upload ── */}
      {step === 'upload' && (
        <div className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-zinc-700 rounded-2xl p-12 text-center cursor-pointer hover:border-zinc-500 hover:bg-zinc-800/30 transition-all"
          >
            <FileSpreadsheet size={40} className="mx-auto text-zinc-600 mb-4" />
            <p className="text-zinc-300 font-medium">Arrastra tu Excel aquí o haz clic para seleccionar</p>
            <p className="text-zinc-600 text-sm mt-2">Formatos: .xlsx, .xls — Máx. 200 trabajadores</p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>

          {parseError && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{parseError}</p>
            </div>
          )}

          {/* Instrucciones */}
          <div className="card space-y-3">
            <p className="text-sm font-semibold text-zinc-300">Formato esperado del Excel</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-zinc-500">
              <div>
                <p className="font-medium text-zinc-400 mb-1 flex items-center gap-1.5"><Users size={13} /> Hoja «Trabajadores»</p>
                <ul className="space-y-0.5 text-xs">
                  <li>• Columna <code className="text-zinc-300">Nombre</code> (requerido)</li>
                  <li>• Columna <code className="text-zinc-300">Apellido</code> (opcional)</li>
                  <li>• Columna <code className="text-zinc-300">Teléfono</code> (opcional)</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-zinc-400 mb-1 flex items-center gap-1.5"><HardHat size={13} /> Hoja «Obras» (opcional)</p>
                <ul className="space-y-0.5 text-xs">
                  <li>• Columna <code className="text-zinc-300">Nombre</code> (requerido)</li>
                  <li>• Columna <code className="text-zinc-300">Dirección</code> (opcional)</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── PASO 2: Preview ── */}
      {step === 'preview' && (
        <div className="space-y-5">
          {/* Archivo y configuración */}
          <div className="card flex items-center gap-3">
            <FileSpreadsheet size={20} className="text-emerald-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{fileName}</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {workers.length} trabajador{workers.length !== 1 ? 'es' : ''}
                {obras.length > 0 && ` · ${obras.length} obra${obras.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <button onClick={() => { setStep('upload'); setParseError('') }} className="text-zinc-600 hover:text-white text-xs">
              Cambiar archivo
            </button>
          </div>

          {/* Dominio de email */}
          <div className="card space-y-2">
            <label className="text-sm font-medium text-zinc-300">Dominio de email</label>
            <div className="flex items-center gap-2">
              <span className="text-zinc-500 text-sm">nombre.apellido @</span>
              <input
                type="text"
                value={emailDomain}
                onChange={e => setEmailDomain(e.target.value.trim())}
                className="input flex-1 font-mono text-sm"
                placeholder="tuempresa.com"
              />
            </div>
            <p className="text-xs text-zinc-600">Los emails se generarán como: <code className="text-zinc-400">nombre.apellido@{emailDomain || 'dominio.com'}</code></p>
          </div>

          {parseError && (
            <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
              <AlertTriangle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{parseError}</p>
            </div>
          )}

          {/* Tabla de preview trabajadores */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
              <p className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <Users size={14} className="text-zinc-500" />
                Trabajadores a importar ({workers.length})
              </p>
              <p className="text-xs text-zinc-600">Elimina filas si hay errores</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-semibold uppercase">Nombre completo</th>
                    <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-semibold uppercase">Usuario generado</th>
                    <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-semibold uppercase">Teléfono</th>
                    <th className="px-4 py-2.5 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w, i) => {
                    const username = (() => {
                      const n = w.full_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').trim()
                      const parts = n.split(/\s+/)
                      return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : parts[0]
                    })()
                    return (
                      <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20">
                        <td className="px-4 py-2.5 text-zinc-200 font-medium">{w.full_name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{username}@{emailDomain}</td>
                        <td className="px-4 py-2.5 text-zinc-500">{w.phone || '—'}</td>
                        <td className="px-4 py-2.5">
                          <button onClick={() => removeWorker(i)} className="text-zinc-700 hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Preview obras */}
          {obras.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-800">
                <p className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                  <HardHat size={14} className="text-zinc-500" />
                  Obras a importar ({obras.length}) — se omiten las que ya existen
                </p>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {obras.map((o, i) => (
                  <div key={i} className="px-5 py-2.5 flex items-center gap-3">
                    <p className="text-sm text-zinc-200 font-medium flex-1">{o.name}</p>
                    <p className="text-xs text-zinc-500 truncate max-w-xs">{o.address || '—'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('upload')} className="btn-secondary flex-1">
              Cancelar
            </button>
            <button
              onClick={runImport}
              disabled={importing || workers.length === 0}
              className="btn-primary flex-1 gap-2"
            >
              {importing
                ? <><Loader2 size={15} className="animate-spin" />Importando...</>
                : <><Upload size={15} />Importar {workers.length} trabajador{workers.length !== 1 ? 'es' : ''}</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ── PASO 3: Resultados ── */}
      {step === 'done' && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card bg-emerald-500/5 border-emerald-500/15">
              <CheckCircle2 size={18} className="text-emerald-400 mb-2" />
              <p className="text-3xl font-bold text-emerald-400">{created}</p>
              <p className="text-xs text-zinc-500 mt-1">Trabajadores creados</p>
            </div>
            <div className="card">
              <XCircle size={18} className="text-zinc-600 mb-2" />
              <p className="text-3xl font-bold text-zinc-400">{skipped}</p>
              <p className="text-xs text-zinc-500 mt-1">Omitidos (ya existían)</p>
            </div>
          </div>

          {/* Aviso contraseñas */}
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/25 rounded-xl px-4 py-3.5">
            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300">
              Las contraseñas se muestran solo una vez. Descarga el Excel de resultados y guárdalo en lugar seguro.
            </p>
          </div>

          {/* Tabla resultados */}
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800">
              <p className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                <Eye size={14} className="text-zinc-500" /> Resultados
              </p>
              <button onClick={exportResults} className="btn-secondary gap-1.5 text-xs py-1.5 px-3">
                <Download size={13} /> Exportar Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-semibold uppercase">Nombre</th>
                    <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-semibold uppercase">Usuario</th>
                    <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-semibold uppercase">Contraseña inicial</th>
                    <th className="text-left px-4 py-2.5 text-xs text-zinc-500 font-semibold uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 last:border-0">
                      <td className="px-4 py-2.5 text-zinc-200 font-medium">{r.full_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{r.username}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">
                        {r.password || <span className="text-zinc-600 italic">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.status === 'created'
                          ? <span className="badge-green">Creado</span>
                          : <span className="badge-gray" title={r.error}>Omitido</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Resultados obras */}
          {obraResults.length > 0 && (
            <div className="card p-0 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-zinc-800">
                <p className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
                  <HardHat size={14} className="text-zinc-500" /> Obras
                </p>
              </div>
              <div className="divide-y divide-zinc-800/50">
                {obraResults.map((o, i) => (
                  <div key={i} className="px-5 py-2.5 flex items-center justify-between">
                    <p className="text-sm text-zinc-200">{o.name}</p>
                    {o.status === 'created'
                      ? <span className="badge-green">Creada</span>
                      : <span className="badge-gray">Ya existe</span>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => { setStep('upload'); setWorkers([]); setObras([]); setResults([]) }} className="btn-secondary w-full">
            Nueva importación
          </button>
        </div>
      )}
    </div>
  )
}
