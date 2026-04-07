'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, todayISO, mapsUrl } from '@/lib/utils'
import type { WorkLocation, Group, Profile } from '@/types'
import {
  Plus, MapPin, Edit2, Trash2, Loader2, X,
  ChevronDown, Navigation, ExternalLink, Calendar, Search,
} from 'lucide-react'

interface LocationWithAssign extends WorkLocation {
  assign_type: 'all' | 'groups' | 'workers'
  group_ids: string[]
  worker_ids: string[]
}

interface GeoResult {
  display_name: string
  lat: string
  lon: string
}

const DEFAULT_RADIUS = 100

export default function LocationsPage() {
  const supabase = createClient()

  const [locations, setLocations]   = useState<LocationWithAssign[]>([])
  const [groups, setGroups]         = useState<Group[]>([])
  const [workers, setWorkers]       = useState<Pick<Profile, 'id' | 'full_name'>[]>([])
  const [dateFilter, setDateFilter] = useState(todayISO())
  const [loading, setLoading]       = useState(true)
  const [showModal, setShowModal]   = useState(false)
  const [editing, setEditing]       = useState<LocationWithAssign | null>(null)
  const [deleting, setDeleting]     = useState<string | null>(null)

  // Form
  const [form, setForm] = useState({
    name: '', address: '', date: todayISO(),
    latitude: '', longitude: '', radius: String(DEFAULT_RADIUS),
    assign_to: 'all' as 'all' | 'groups' | 'workers',
    group_ids: [] as string[],
    worker_ids: [] as string[],
  })
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

  // Geocoding
  const [geoSearch, setGeoSearch]   = useState('')
  const [geoResults, setGeoResults] = useState<GeoResult[]>([])
  const [geoSearching, setGeoSearching] = useState(false)
  const geoDebounce = useRef<NodeJS.Timeout | null>(null)

  async function load() {
    setLoading(true)
    const { data: locs } = await supabase
      .from('work_locations')
      .select('id, name, address, date, latitude, longitude, radius, active, created_by, created_at, updated_at')
      .eq('date', dateFilter)
      .order('name')

    const { data: assigns } = await supabase
      .from('location_assignments')
      .select('work_location_id, worker_id, group_id')
      .in('work_location_id', (locs ?? []).map(l => l.id))

    const enriched: LocationWithAssign[] = ((locs ?? []) as WorkLocation[]).map(loc => {
      const locAssigns = (assigns ?? []).filter(a => a.work_location_id === loc.id)
      const group_ids  = locAssigns.filter(a => a.group_id).map(a => a.group_id!)
      const worker_ids = locAssigns.filter(a => a.worker_id).map(a => a.worker_id!)
      const isAll      = locAssigns.some(a => !a.worker_id && !a.group_id)
      return {
        ...loc,
        assign_type: isAll ? 'all' : group_ids.length > 0 ? 'groups' : 'workers',
        group_ids,
        worker_ids,
      }
    })

    const { data: grps } = await supabase.from('groups').select('id, name, description, created_at').order('name')
    const { data: wkrs } = await supabase
      .from('profiles').select('id, full_name').eq('role', 'worker').eq('active', true).order('full_name')

    setLocations(enriched)
    setGroups((grps ?? []) as Group[])
    setWorkers((wkrs ?? []) as Pick<Profile, 'id' | 'full_name'>[])
    setLoading(false)
  }

  useEffect(() => { load() }, [dateFilter]) // eslint-disable-line

  // Geocoding: buscar dirección via Nominatim (proxy interno)
  const searchAddress = useCallback((query: string) => {
    if (!query.trim() || query.length < 4) { setGeoResults([]); return }
    if (geoDebounce.current) clearTimeout(geoDebounce.current)
    geoDebounce.current = setTimeout(async () => {
      setGeoSearching(true)
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
        const data: GeoResult[] = await res.json()
        setGeoResults(data.slice(0, 5))
      } catch {
        setGeoResults([])
      }
      setGeoSearching(false)
    }, 500)
  }, [])

  function selectGeoResult(r: GeoResult) {
    setForm(f => ({
      ...f,
      latitude:  parseFloat(r.lat).toFixed(7),
      longitude: parseFloat(r.lon).toFixed(7),
      address:   r.display_name,
    }))
    setGeoSearch(r.display_name)
    setGeoResults([])
  }

  function openNew() {
    setEditing(null)
    setForm({ name: '', address: '', date: dateFilter, latitude: '', longitude: '', radius: String(DEFAULT_RADIUS), assign_to: 'all', group_ids: [], worker_ids: [] })
    setGeoSearch('')
    setGeoResults([])
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(loc: LocationWithAssign) {
    setEditing(loc)
    setForm({
      name: loc.name, address: loc.address ?? '', date: loc.date,
      latitude: String(loc.latitude), longitude: String(loc.longitude),
      radius: String(loc.radius), assign_to: loc.assign_type,
      group_ids: loc.group_ids, worker_ids: loc.worker_ids,
    })
    setGeoSearch(loc.address ?? '')
    setGeoResults([])
    setFormError(null)
    setShowModal(true)
  }

  async function getMyLocation() {
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setForm(f => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(7),
          longitude: pos.coords.longitude.toFixed(7),
        }))
        setGeoLoading(false)
      },
      () => { setGeoLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)
    const res = await fetch(editing ? `/api/locations/${editing.id}` : '/api/locations', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (!res.ok) { setFormError(json.error ?? 'Error al guardar'); setSaving(false); return }
    setShowModal(false)
    await load()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    await fetch(`/api/locations/${id}`, { method: 'DELETE' })
    await load()
    setDeleting(null)
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Ubicaciones</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Gestión de obras y puntos de fichaje</p>
        </div>
        <button onClick={openNew} className="btn-primary gap-2">
          <Plus size={16} />Nueva
        </button>
      </div>

      {/* ── Filtro fecha ── */}
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-zinc-500 flex-shrink-0" />
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="input max-w-[180px]"
        />
        <span className="text-zinc-600 text-sm capitalize">{formatDate(dateFilter)}</span>
      </div>

      {/* ── Lista ── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <MapPin size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-3">No hay ubicaciones para esta fecha</p>
          <button onClick={openNew} className="btn-secondary gap-2">
            <Plus size={15} />Crear ubicación
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {locations.map(loc => (
            <div key={loc.id} className={`card ${!loc.active ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MapPin size={16} className="text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zinc-200">{loc.name}</p>
                  {loc.address && <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{loc.address}</p>}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="badge-gray">R: {loc.radius} m</span>
                    <span className="badge-white">
                      {loc.assign_type === 'all' ? 'Todos' :
                       loc.assign_type === 'groups' ? `${loc.group_ids.length} grupos` :
                       `${loc.worker_ids.length} trabajadores`}
                    </span>
                    {!loc.active && <span className="badge-red">Inactiva</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-zinc-800">
                <a
                  href={mapsUrl(loc.latitude, loc.longitude, loc.name)}
                  target="_blank" rel="noopener noreferrer"
                  className="btn-ghost text-xs gap-1 flex-1 justify-center"
                >
                  <ExternalLink size={13} /> Mapa
                </a>
                <button onClick={() => openEdit(loc)} className="btn-ghost text-xs gap-1 flex-1 justify-center">
                  <Edit2 size={13} /> Editar
                </button>
                <button
                  onClick={() => handleDelete(loc.id)}
                  disabled={deleting === loc.id}
                  className="btn-ghost text-xs gap-1 flex-1 justify-center text-red-500 hover:text-red-400 hover:bg-red-500/10"
                >
                  {deleting === loc.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Borrar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900">
              <h2 className="font-semibold text-white">
                {editing ? 'Editar ubicación' : 'Nueva ubicación'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-5 space-y-4">

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Nombre de la obra *</label>
                <input className="input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Edificio Las Palmas – Fase 2" />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Fecha *</label>
                <input type="date" className="input" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>

              {/* ── GEOCODING: buscar por dirección ── */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-zinc-300">Buscar dirección</label>
                  <button
                    type="button"
                    onClick={getMyLocation}
                    disabled={geoLoading}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"
                  >
                    {geoLoading ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
                    Usar mi ubicación
                  </button>
                </div>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    className="input pl-9"
                    value={geoSearch}
                    onChange={e => { setGeoSearch(e.target.value); searchAddress(e.target.value) }}
                    placeholder="Calle y número, ciudad…"
                  />
                  {geoSearching && (
                    <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" />
                  )}
                  {geoResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-zinc-800 border border-zinc-700 rounded-xl shadow-2xl z-10 overflow-hidden">
                      {geoResults.map((r, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => selectGeoResult(r)}
                          className="w-full text-left px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors border-b border-zinc-700/50 last:border-0"
                        >
                          <MapPin size={12} className="inline mr-2 text-zinc-500" />
                          {r.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Coordenadas manuales */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Coordenadas GPS</label>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" value={form.latitude}
                    onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                    placeholder="Latitud (40.4168)" />
                  <input className="input text-sm" value={form.longitude}
                    onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                    placeholder="Longitud (-3.7038)" />
                </div>
                {form.latitude && form.longitude && (
                  <a
                    href={mapsUrl(parseFloat(form.latitude), parseFloat(form.longitude))}
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 mt-2 hover:underline"
                  >
                    <ExternalLink size={11} /> Ver en mapa
                  </a>
                )}
              </div>

              {/* Radio */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                  Radio máximo: <strong className="text-white">{form.radius} metros</strong>
                </label>
                <input
                  type="range" min={25} max={1000} step={25}
                  value={form.radius}
                  onChange={e => setForm(f => ({ ...f, radius: e.target.value }))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-zinc-600 mt-1">
                  <span>25 m</span><span>500 m</span><span>1 km</span>
                </div>
              </div>

              {/* Asignación */}
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Asignar a</label>
                <div className="relative">
                  <select
                    className="input appearance-none pr-10"
                    value={form.assign_to}
                    onChange={e => setForm(f => ({ ...f, assign_to: e.target.value as 'all' | 'groups' | 'workers' }))}
                  >
                    <option value="all">Todos los trabajadores</option>
                    <option value="groups">Grupos específicos</option>
                    <option value="workers">Trabajadores específicos</option>
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              {form.assign_to === 'groups' && (
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Selecciona grupos</label>
                  <div className="flex flex-wrap gap-2">
                    {groups.map(g => (
                      <button key={g.id} type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          group_ids: f.group_ids.includes(g.id) ? f.group_ids.filter(id => id !== g.id) : [...f.group_ids, g.id],
                        }))}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                          form.group_ids.includes(g.id)
                            ? 'bg-white text-zinc-950 border-white'
                            : 'bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500'
                        }`}
                      >{g.name}</button>
                    ))}
                  </div>
                </div>
              )}

              {form.assign_to === 'workers' && (
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Selecciona trabajadores</label>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {workers.map(w => (
                      <label key={w.id} className="flex items-center gap-3 py-2 px-2 rounded-lg cursor-pointer hover:bg-zinc-800 transition-colors">
                        <input
                          type="checkbox"
                          checked={form.worker_ids.includes(w.id)}
                          onChange={e => setForm(f => ({
                            ...f,
                            worker_ids: e.target.checked
                              ? [...f.worker_ids, w.id]
                              : f.worker_ids.filter(id => id !== w.id),
                          }))}
                          className="w-4 h-4 accent-white"
                        />
                        <span className="text-sm text-zinc-300">{w.full_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {formError && (
                <p className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3">{formError}</p>
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
