'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, todayISO, mapsUrl } from '@/lib/utils'
import type { WorkLocation, Group, Profile } from '@/types'
import {
  Plus, MapPin, Edit2, Trash2, Loader2, X,
  ChevronDown, Navigation, ExternalLink, Calendar,
} from 'lucide-react'

interface LocationWithAssign extends WorkLocation {
  assign_type: 'all' | 'groups' | 'workers'
  group_ids: string[]
  worker_ids: string[]
}

const DEFAULT_RADIUS = 100

export default function LocationsPage() {
  const supabase = createClient()

  const [locations, setLocations]     = useState<LocationWithAssign[]>([])
  const [groups, setGroups]           = useState<Group[]>([])
  const [workers, setWorkers]         = useState<Pick<Profile, 'id' | 'full_name'>[]>([])
  const [dateFilter, setDateFilter]   = useState(todayISO())
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [editing, setEditing]         = useState<LocationWithAssign | null>(null)
  const [deleting, setDeleting]       = useState<string | null>(null)

  // Form
  const [form, setForm] = useState({
    name: '', address: '', date: todayISO(),
    latitude: '', longitude: '', radius: String(DEFAULT_RADIUS),
    assign_to: 'all' as 'all' | 'groups' | 'workers',
    group_ids: [] as string[],
    worker_ids: [] as string[],
  })
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [geoLoading, setGeoLoading] = useState(false)

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
      const isAll = locAssigns.some(a => !a.worker_id && !a.group_id)
      return {
        ...loc,
        assign_type: isAll ? 'all' : group_ids.length > 0 ? 'groups' : 'workers',
        group_ids,
        worker_ids,
      }
    })

    const { data: grps } = await supabase.from('groups').select('id, name, description, created_at').order('name')
    const { data: wkrs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('role', 'worker')
      .eq('active', true)
      .order('full_name')

    setLocations(enriched)
    setGroups((grps ?? []) as Group[])
    setWorkers((wkrs ?? []) as Pick<Profile, 'id' | 'full_name'>[])
    setLoading(false)
  }

  useEffect(() => { load() }, [dateFilter]) // eslint-disable-line

  function openNew() {
    setEditing(null)
    setForm({
      name: '', address: '', date: dateFilter,
      latitude: '', longitude: '', radius: String(DEFAULT_RADIUS),
      assign_to: 'all', group_ids: [], worker_ids: [],
    })
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(loc: LocationWithAssign) {
    setEditing(loc)
    setForm({
      name: loc.name,
      address: loc.address ?? '',
      date: loc.date,
      latitude: String(loc.latitude),
      longitude: String(loc.longitude),
      radius: String(loc.radius),
      assign_to: loc.assign_type,
      group_ids: loc.group_ids,
      worker_ids: loc.worker_ids,
    })
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

    if (!res.ok) {
      setFormError(json.error ?? 'Error al guardar')
      setSaving(false)
      return
    }

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
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Ubicaciones</h1>
        <button onClick={openNew} className="btn-primary py-2.5 px-4 text-sm flex items-center gap-1.5">
          <Plus size={18} />Nueva
        </button>
      </div>

      {/* Filtro por fecha */}
      <div className="flex items-center gap-2">
        <Calendar size={18} className="text-gray-400 flex-shrink-0" />
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="input flex-1"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        </div>
      ) : locations.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <MapPin size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay ubicaciones para esta fecha</p>
          <button onClick={openNew} className="mt-3 text-orange-500 text-sm font-medium">
            + Crear ubicación
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {locations.map(loc => (
            <div key={loc.id} className={`card ${!loc.active ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="bg-orange-100 rounded-xl p-2.5 flex-shrink-0">
                  <MapPin size={20} className="text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900">{loc.name}</p>
                  {loc.address && <p className="text-xs text-gray-500 mt-0.5 truncate">{loc.address}</p>}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    <span className="badge-orange">Radio: {loc.radius} m</span>
                    <span className="badge-gray capitalize">
                      {loc.assign_type === 'all' ? 'Todos' :
                       loc.assign_type === 'groups' ? `${loc.group_ids.length} grupo(s)` :
                       `${loc.worker_ids.length} trabajador(es)`}
                    </span>
                    {!loc.active && <span className="badge-red">Inactiva</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <a
                    href={mapsUrl(loc.latitude, loc.longitude, loc.name)}
                    target="_blank" rel="noopener noreferrer"
                    className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    <ExternalLink size={16} />
                  </a>
                  <button onClick={() => openEdit(loc)} className="p-2 text-gray-400 hover:text-orange-500 transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(loc.id)}
                    disabled={deleting === loc.id}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    {deleting === loc.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-2xl mx-auto rounded-t-3xl max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-bold text-gray-900 text-lg">
                {editing ? 'Editar ubicación' : 'Nueva ubicación'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 p-1">
                <X size={22} />
              </button>
            </div>

            <div className="px-5 py-4 pb-8 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Nombre de la obra *</label>
                <input className="input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Edificio Las Palmas - Fase 2" />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Dirección</label>
                <input className="input" value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Calle, número, ciudad" />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Fecha *</label>
                <input type="date" className="input" value={form.date}
                  onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              </div>

              {/* Coordenadas */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-gray-700">Coordenadas GPS *</label>
                  <button
                    type="button"
                    onClick={getMyLocation}
                    disabled={geoLoading}
                    className="flex items-center gap-1.5 text-xs text-orange-500 font-medium"
                  >
                    {geoLoading ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
                    Usar mi ubicación
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input text-sm" value={form.latitude}
                    onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                    placeholder="Latitud (ej: 40.4168)" />
                  <input className="input text-sm" value={form.longitude}
                    onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                    placeholder="Longitud (ej: -3.7038)" />
                </div>
                {form.latitude && form.longitude && (
                  <a
                    href={mapsUrl(parseFloat(form.latitude), parseFloat(form.longitude))}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs text-blue-500 flex items-center gap-1 mt-1.5"
                  >
                    <ExternalLink size={12} /> Ver en mapa
                  </a>
                )}
              </div>

              {/* Radio */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                  Radio máximo: <strong>{form.radius} metros</strong>
                </label>
                <input
                  type="range" min={25} max={1000} step={25}
                  value={form.radius}
                  onChange={e => setForm(f => ({ ...f, radius: e.target.value }))}
                  className="w-full accent-orange-500"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>25 m</span><span>500 m</span><span>1 km</span>
                </div>
              </div>

              {/* Asignación */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Asignar a</label>
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
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {form.assign_to === 'groups' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Selecciona grupos</label>
                  <div className="flex flex-wrap gap-2">
                    {groups.map(g => (
                      <button key={g.id} type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          group_ids: f.group_ids.includes(g.id)
                            ? f.group_ids.filter(id => id !== g.id)
                            : [...f.group_ids, g.id],
                        }))}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          form.group_ids.includes(g.id) ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                      >{g.name}</button>
                    ))}
                  </div>
                </div>
              )}

              {form.assign_to === 'workers' && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Selecciona trabajadores</label>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {workers.map(w => (
                      <label key={w.id} className="flex items-center gap-3 py-2 px-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.worker_ids.includes(w.id)}
                          onChange={e => setForm(f => ({
                            ...f,
                            worker_ids: e.target.checked
                              ? [...f.worker_ids, w.id]
                              : f.worker_ids.filter(id => id !== w.id),
                          }))}
                          className="w-4 h-4 accent-orange-500"
                        />
                        <span className="text-sm text-gray-700">{w.full_name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {formError && (
                <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{formError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 size={16} className="animate-spin" />Guardando...</> : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
