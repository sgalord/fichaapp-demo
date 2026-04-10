'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Obra } from '@/types'
import {
  Plus, Search, Edit2, ToggleLeft, ToggleRight, Loader2, X,
  HardHat, MapPin, Ruler, CheckCircle2, AlertTriangle,
} from 'lucide-react'

interface GeoSuggestion {
  latitude:     number
  longitude:    number
  display_name: string
  label:        string
}

export default function ObrasPage() {
  const [obras, setObras]         = useState<Obra[]>([])
  const [query, setQuery]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<Obra | null>(null)
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Geocoding / autocomplete
  const [geocodeOk, setGeocodeOk]         = useState(false)
  const [geocodeErr, setGeocodeErr]       = useState<string | null>(null)
  const [suggestions, setSuggestions]     = useState<GeoSuggestion[]>([])
  const [showSugg, setShowSugg]           = useState(false)
  const [loadingSugg, setLoadingSugg]     = useState(false)
  const debounceRef                       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addressWrapRef                    = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState({
    name: '', address: '', latitude: '', longitude: '', radius: '200',
  })

  // ── Cerrar dropdown al click fuera ──────────────────────────────────────
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (addressWrapRef.current && !addressWrapRef.current.contains(e.target as Node)) {
        setShowSugg(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/obras')
    if (res.ok) {
      const { data } = await res.json()
      setObras(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function resetGeoState() {
    setGeocodeOk(false)
    setGeocodeErr(null)
    setSuggestions([])
    setShowSugg(false)
  }

  function openNew() {
    setEditing(null)
    setForm({ name: '', address: '', latitude: '', longitude: '', radius: '200' })
    setFormError(null)
    resetGeoState()
    setShowModal(true)
  }

  function openEdit(obra: Obra) {
    setEditing(obra)
    setForm({
      name:      obra.name,
      address:   obra.address ?? '',
      latitude:  obra.latitude?.toString()  ?? '',
      longitude: obra.longitude?.toString() ?? '',
      radius:    obra.radius.toString(),
    })
    setFormError(null)
    setGeocodeOk(!!(obra.latitude && obra.longitude))
    setGeocodeErr(null)
    setSuggestions([])
    setShowSugg(false)
    setShowModal(true)
  }

  // ── Autocomplete: busca sugerencias con debounce 350 ms ────────────────
  const fetchSuggestions = useCallback(async (text: string) => {
    if (text.trim().length < 3) {
      setSuggestions([])
      setShowSugg(false)
      return
    }
    setLoadingSugg(true)
    try {
      const res = await fetch(
        `/api/geocode?address=${encodeURIComponent(text.trim())}&limit=5`,
      )
      if (res.ok) {
        const data: GeoSuggestion[] = await res.json()
        setSuggestions(Array.isArray(data) ? data : [])
        setShowSugg(Array.isArray(data) && data.length > 0)
      }
    } catch {
      // silencioso
    } finally {
      setLoadingSugg(false)
    }
  }, [])

  function handleAddressChange(value: string) {
    setForm(f => ({ ...f, address: value }))
    setGeocodeOk(false)
    setGeocodeErr(null)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 350)
  }

  // ── Seleccionar sugerencia ─────────────────────────────────────────────
  function pickSuggestion(s: GeoSuggestion) {
    setForm(f => ({
      ...f,
      address:   s.label,
      latitude:  s.latitude.toString(),
      longitude: s.longitude.toString(),
    }))
    setGeocodeOk(true)
    setGeocodeErr(null)
    setSuggestions([])
    setShowSugg(false)
  }

  // ── Guardar ────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return }
    setSaving(true); setFormError(null)

    let lat = form.latitude  ? parseFloat(form.latitude)  : null
    let lng = form.longitude ? parseFloat(form.longitude) : null

    // Auto-geocodificar si hay dirección pero aún no hay coords
    if (form.address.trim() && (!lat || !lng)) {
      try {
        const res  = await fetch(`/api/geocode?address=${encodeURIComponent(form.address.trim())}`)
        const json = await res.json()
        if (res.ok && json.latitude != null) {
          lat = json.latitude
          lng = json.longitude
          setGeocodeOk(true)
        }
      } catch { /* guarda sin coords */ }
    }

    const body = {
      name:      form.name,
      address:   form.address,
      latitude:  lat,
      longitude: lng,
      radius:    parseInt(form.radius) || 200,
    }

    const url    = editing ? `/api/obras/${editing.id}` : '/api/obras'
    const method = editing ? 'PUT' : 'POST'
    const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json   = await res.json()

    if (!res.ok) { setFormError(json.error ?? 'Error al guardar'); setSaving(false); return }
    setShowModal(false)
    await load()
    setSaving(false)
  }

  async function toggleActive(obra: Obra) {
    await fetch(`/api/obras/${obra.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !obra.active }),
    })
    await load()
  }

  const filtered = obras.filter(o =>
    o.name.toLowerCase().includes(query.toLowerCase()) ||
    (o.address ?? '').toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Obras</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {obras.filter(o => o.active).length} activas · {obras.filter(o => !o.active).length} inactivas
          </p>
        </div>
        <button onClick={openNew} className="btn-primary gap-2"><Plus size={16} />Nueva obra</button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nombre o dirección..." className="input pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(obra => (
            <div key={obra.id} className={`card ${!obra.active ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <HardHat size={17} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-zinc-200">{obra.name}</p>
                    {!obra.active && <span className="badge-red">Inactiva</span>}
                    {!(obra.latitude && obra.longitude) && (
                      <span className="badge-orange text-[10px]">Sin GPS</span>
                    )}
                  </div>
                  {obra.address && (
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                      <MapPin size={11} />{obra.address}
                    </p>
                  )}
                  {obra.latitude && obra.longitude ? (
                    <p className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1">
                      <CheckCircle2 size={10} className="text-emerald-600" />
                      {obra.latitude.toFixed(5)}, {obra.longitude.toFixed(5)}
                      <span className="ml-1 inline-flex items-center gap-0.5">
                        <Ruler size={10} />{obra.radius} m
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-amber-600/70 mt-0.5">Sin coordenadas — edita para añadir</p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(obra)}
                    className="p-2 text-zinc-500 hover:text-white transition-colors rounded-lg hover:bg-zinc-800">
                    <Edit2 size={15} />
                  </button>
                  <button onClick={() => toggleActive(obra)}
                    className="p-2 text-zinc-500 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"
                    title={obra.active ? 'Desactivar' : 'Activar'}>
                    {obra.active ? <ToggleRight size={15} className="text-emerald-400" /> : <ToggleLeft size={15} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-14 text-zinc-600">
              <HardHat size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{query ? 'No hay resultados' : 'Sin obras registradas'}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
              <h2 className="font-semibold text-white">{editing ? 'Editar obra' : 'Nueva obra'}</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white p-1"><X size={20} /></button>
            </div>
            <div className="px-5 py-5 space-y-4">

              {/* Nombre */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Nombre *</label>
                <input className="input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Edificio Calle Mayor 12" />
              </div>

              {/* Dirección con autocomplete */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                  Dirección
                  {loadingSugg && <Loader2 size={11} className="inline ml-1.5 animate-spin text-zinc-500" />}
                </label>

                <div ref={addressWrapRef} className="relative">
                  <input
                    className="input w-full"
                    value={form.address}
                    onChange={e => handleAddressChange(e.target.value)}
                    onFocus={() => suggestions.length > 0 && setShowSugg(true)}
                    placeholder="Ej: Calle Aguilera 4, Madrid"
                    autoComplete="off"
                  />

                  {/* ── Dropdown sugerencias ── */}
                  {showSugg && suggestions.length > 0 && (
                    <ul className="absolute left-0 right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                      {suggestions.map((s, i) => (
                        <li key={i}>
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); pickSuggestion(s) }}
                            className="w-full text-left px-4 py-3 hover:bg-zinc-700 transition-colors border-b border-zinc-700/50 last:border-0 flex items-start gap-2.5"
                          >
                            <MapPin size={13} className="text-zinc-400 flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-zinc-200 leading-snug">{s.label}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Feedback */}
                {geocodeOk && (
                  <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1.5">
                    <CheckCircle2 size={11} />
                    Coordenadas: {parseFloat(form.latitude).toFixed(5)}, {parseFloat(form.longitude).toFixed(5)}
                  </p>
                )}
                {geocodeErr && (
                  <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1.5">
                    <AlertTriangle size={11} />{geocodeErr}
                  </p>
                )}
                {!geocodeOk && !geocodeErr && (
                  <p className="text-xs text-zinc-600 mt-1">Escribe la dirección y selecciona del desplegable</p>
                )}
              </div>

              {/* Lat/Lng manuales (colapsados si ya hay coords) */}
              {!geocodeOk && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Latitud</label>
                    <input className="input" type="number" step="any" value={form.latitude}
                      onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                      placeholder="40.416775" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Longitud</label>
                    <input className="input" type="number" step="any" value={form.longitude}
                      onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                      placeholder="-3.703790" />
                  </div>
                </div>
              )}

              {/* Botón para editar coords manualmente si autocomplete ya funcionó */}
              {geocodeOk && (
                <button
                  type="button"
                  onClick={() => setGeocodeOk(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-300 underline"
                >
                  Editar coordenadas manualmente
                </button>
              )}

              {/* Radio */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Ruler size={13} />Radio de fichaje (metros)
                </label>
                <input className="input" type="number" min="50" max="5000" value={form.radius}
                  onChange={e => setForm(f => ({ ...f, radius: e.target.value }))} />
              </div>

              {formError && (
                <p className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3">
                  {formError}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
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
