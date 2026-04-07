'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { initials, avatarColor } from '@/lib/utils'
import type { Profile, Group } from '@/types'
import {
  Plus, Search, Edit2, UserX, UserCheck,
  Loader2, X, Eye, EyeOff, ChevronDown,
} from 'lucide-react'

type WorkerWithGroups = Profile & { groups: Group[] }

export default function WorkersPage() {
  const supabase = createClient()

  const [workers, setWorkers]     = useState<WorkerWithGroups[]>([])
  const [groups, setGroups]       = useState<Group[]>([])
  const [query, setQuery]         = useState('')
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<WorkerWithGroups | null>(null)

  // Form state
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', phone: '',
    role: 'worker', group_ids: [] as string[],
  })
  const [showPass, setShowPass]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    // Trabajadores con sus grupos en una sola consulta join
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, active, created_at, updated_at')
      .in('role', ['worker', 'admin'])
      .order('full_name')

    const { data: ug } = await supabase
      .from('user_groups')
      .select('user_id, group_id, groups(id, name)')

    const { data: grps } = await supabase
      .from('groups')
      .select('id, name, description, created_at')
      .order('name')

    const groupsByUser: Record<string, Group[]> = {}
    for (const row of (ug ?? []) as unknown as { user_id: string; groups: Group }[]) {
      if (!groupsByUser[row.user_id]) groupsByUser[row.user_id] = []
      if (row.groups) groupsByUser[row.user_id].push(row.groups)
    }

    const enriched: WorkerWithGroups[] = ((profiles ?? []) as Profile[]).map(p => ({
      ...p,
      groups: groupsByUser[p.id] ?? [],
    }))

    setWorkers(enriched)
    setGroups((grps ?? []) as Group[])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  function openNew() {
    setEditing(null)
    setForm({ full_name: '', email: '', password: '', phone: '', role: 'worker', group_ids: [] })
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(w: WorkerWithGroups) {
    setEditing(w)
    setForm({
      full_name: w.full_name,
      email: '',
      password: '',
      phone: w.phone ?? '',
      role: w.role,
      group_ids: w.groups.map(g => g.id),
    })
    setFormError(null)
    setShowModal(true)
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)

    const res = await fetch(editing ? `/api/workers/${editing.id}` : '/api/workers', {
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

  async function toggleActive(w: WorkerWithGroups) {
    await fetch(`/api/workers/${w.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !w.active }),
    })
    await load()
  }

  const filtered = workers.filter(w =>
    w.full_name.toLowerCase().includes(query.toLowerCase()) ||
    w.phone?.includes(query)
  )

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Trabajadores</h1>
        <button onClick={openNew} className="btn-primary py-2.5 px-4 text-sm flex items-center gap-1.5">
          <Plus size={18} />Nuevo
        </button>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono..."
          className="input pl-10"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(w => (
            <div key={w.id} className={`card flex items-center gap-3 ${!w.active ? 'opacity-60' : ''}`}>
              <div className={`${avatarColor(w.full_name)} w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                {initials(w.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{w.full_name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={w.role === 'worker' ? 'badge-gray' : 'badge-orange'}>
                    {w.role === 'worker' ? 'Trabajador' : 'Admin'}
                  </span>
                  {!w.active && <span className="badge-red">Inactivo</span>}
                  {w.groups.map(g => (
                    <span key={g.id} className="badge-blue">{g.name}</span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(w)} className="p-2 text-gray-400 hover:text-orange-500 transition-colors">
                  <Edit2 size={16} />
                </button>
                <button onClick={() => toggleActive(w)} className="p-2 text-gray-400 hover:text-red-500 transition-colors" title={w.active ? 'Desactivar' : 'Activar'}>
                  {w.active ? <UserX size={16} /> : <UserCheck size={16} />}
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-8 text-sm">
              {query ? 'No hay resultados' : 'Sin trabajadores'}
            </p>
          )}
        </div>
      )}

      {/* Modal crear/editar */}
      {showModal && (
        <Modal
          title={editing ? 'Editar trabajador' : 'Nuevo trabajador'}
          onClose={() => setShowModal(false)}
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Nombre completo *</label>
              <input
                className="input"
                value={form.full_name}
                onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Juan García"
              />
            </div>

            {!editing && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Email *</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="juan@email.com"
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">
                {editing ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pr-12"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Teléfono</label>
              <input
                type="tel"
                className="input"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="600 000 000"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Rol</label>
              <div className="relative">
                <select
                  className="input appearance-none pr-10"
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="worker">Trabajador</option>
                  <option value="admin">Administrador</option>
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1.5 block">Grupos</label>
              <div className="flex flex-wrap gap-2">
                {groups.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      group_ids: f.group_ids.includes(g.id)
                        ? f.group_ids.filter(id => id !== g.id)
                        : [...f.group_ids, g.id],
                    }))}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      form.group_ids.includes(g.id)
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
                {groups.length === 0 && (
                  <p className="text-sm text-gray-400">No hay grupos creados</p>
                )}
              </div>
            </div>

            {formError && (
              <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{formError}</p>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={16} className="animate-spin" />Guardando...</> : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }: {
  title: string
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
      <div className="bg-white w-full max-w-2xl mx-auto rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900 text-lg">{title}</h2>
          <button onClick={onClose} className="text-gray-400 p-1">
            <X size={22} />
          </button>
        </div>
        <div className="px-5 py-4 pb-8">{children}</div>
      </div>
    </div>
  )
}
