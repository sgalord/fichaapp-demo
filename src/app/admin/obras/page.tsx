'use client'

import { useState, useEffect } from 'react'
import type { Obra } from '@/types'
import {
  Plus, Search, Edit2, ToggleLeft, ToggleRight, Loader2, X,
  HardHat, MapPin, Ruler, CheckCircle2, AlertTriangle,
} from 'lucide-react'

export default function ObrasPage() {
  const [obras, setObras]         = useState<Obra[]>([])
  const [query, setQuery]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<Obra | null>(null)
  const [saving, setSaving]             = useState(false)
  const [formError, setFormError]       = useState<string | null>(null)
  const [geocoding, setGeocoding]       = useState(false)
  const [geocodeOk, setGeocodeOk]       = useState(false)
  const [geocodeErr, setGeocodeErr]     = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '', address: '', latitude: '', longitude: '', radius: '200',
  })

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
      name: obra.name,
      address: obra.address ?? '',
      latitude: obra.latitude?.toString() ?? '',
      longitude: obra.longitude?.toString() ?? '',
      radius: obra.radius.toString(),
    })
    setFormError(null)
    // Si ya tiene coordenadas, mostrar como OK
    setGeocodeOk(!!(obra.latitude && obra.longitude))
    setGeocodeErr(null)
    setShowModal(true)
  }

  async function geocodeAddress(addressOverride?: string) {
    const addr = (addressOverride ?? form.address).trim()
    if (!addr) return
    setGeocoding(true)
    setGeocodeOk(false)
    setGeocodeErr(null)
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`)
      const json = await res.json()
      if (res.ok && json.latitude != null) {
        setForm(f => ({
          ...f,
          latitude:  json.latitude.toString(),
          longitude: json.longitude.toString(),
        }))
        setGeocodeOk(true)
      } else {
        setGeocodeErr(json.error ?? 'Dirección no encontrada — introduce coordenadas manualmente')
      }
    } catch {
      setGeocodeErr('Error de red al geocodificar')
    } finally {
      setGeocoding(false)
    }
  }

  // Auto-geocodificar al salir del campo dirección si no hay coords ya
  async function handleAddressBlur() {
    if (!form.address.trim()) return
    if (form.latitude && form.longitude) return   // ya tiene coords, no sobreescribir
    await geocodeAddress()
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return }
    setSaving(true); setFormError(null)

    // Auto-geocodificar si hay dirección pero faltan coordenadas
    let lat  = form.latitude  ? parseFloat(form.latitude)  : null
    let lng  = form.longitude ? parseFloat(form.longitude) : null
    if (form.address.trim() && (!lat || !lng)) {
      try {
        const res  = await fetch(`/api/geocode?address=${encodeURIComponent(form.address.trim())}`)
        const json = await res.json()
        if (res.ok && json.latitude != null) {
          lat = json.latitude
          lng = json.longitude
          setForm(f => ({ ...f, latitude: String(lat), longitude: String(lng) }))
          setGeocodeOk(true)
        }
      } catch { /* ignora, guardamos sin coords */ }
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
    (o.address ?? '').toLowerCase().includes(query.toLowerCase())
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
                  </div>
                  {obra.address && (
                    <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                      <MapPin size={11} />{obra.address}
                    </p>
                  )}
                  {obra.latitude && obra.longitude && (
                    <p className="text-xs text-zinc-600 mt-0.5">
                      {obra.latitude.toFixed(5)}, {obra.longitude.toFixed(5)}
                      <span className="ml-2 flex items-center gap-0.5 inline-flex">
                        <Ruler size={10} />{obra.radius}m
                      </span>
                    </p>
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
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="font-semibold text-white">{editing ? 'Editar obra' : 'Nueva obra'}</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white p-1"><X size={20} /></button>
            </div>
            <div className="px-5 py-5 space-y-4">

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Nombre *</label>
                <input className="input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Edificio Calle Mayor 12" />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Dirección</label>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    value={form.address}
                    onChange={e => {
                      setForm(f => ({ ...f, address: e.target.value }))
                      resetGeoState()
                    }}
                    onBlur={handleAddressBlur}
                    placeholder="Ej: Calle Aguilera 4, Madrid"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); geocodeAddress() } }}
                  />
                  <button
                    type="button"
                    onClick={() => geocodeAddress()}
                    disabled={geocoding || !form.address.trim()}
                    className="btn-secondary px-3 flex-shrink-0 gap-1.5"
                    title="Obtener coordenadas de la dirección"
                  >
                    {geocoding
                      ? <Loader2 size={14} className="animate-spin" />
                      : <MapPin size={14} />
                    }
                    Geocodificar
                  </button>
                </div>

                {/* Feedback geocodificación */}
                {geocoding && (
                  <p className="text-xs text-zinc-400 mt-1.5 flex items-center gap-1.5">
                    <Loader2 size={11} className="animate-spin" />Buscando coordenadas...
                  </p>
                )}
                {geocodeOk && !geocoding && (
                  <p className="text-xs text-emerald-400 mt-1.5 flex items-center gap-1.5">
                    <CheckCircle2 size={11} />
                    Coordenadas obtenidas: {parseFloat(form.latitude).toFixed(5)}, {parseFloat(form.longitude).toFixed(5)}
                  </p>
                )}
                {geocodeErr && !geocoding && (
                  <p className="text-xs text-amber-400 mt-1.5 flex items-center gap-1.5">
                    <AlertTriangle size={11} />{geocodeErr}
                  </p>
                )}
                {!geocoding && !geocodeOk && !geocodeErr && (
                  <p className="text-xs text-zinc-600 mt-1">
                    Las coordenadas se obtienen automáticamente al escribir la dirección
                  </p>
                )}
              </div>

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

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block flex items-center gap-1.5">
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
