'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Group, Profile } from '@/types'
import { Plus, Trash2, Users, Loader2, X, Edit2 } from 'lucide-react'

interface GroupWithCount extends Group {
  member_count: number
  members: Pick<Profile, 'id' | 'full_name'>[]
}

export default function GroupsPage() {
  const supabase = createClient()
  const [groups, setGroups]     = useState<GroupWithCount[]>([])
  const [loading, setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]   = useState<Group | null>(null)
  const [form, setForm]         = useState({ name: '', description: '' })
  const [saving, setSaving]     = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data: grps } = await supabase
      .from('groups')
      .select('id, name, description, created_at')
      .order('name')

    const { data: ug } = await supabase
      .from('user_groups')
      .select('group_id, user_id, profiles!user_id(id, full_name)')

    const byGroup: Record<string, Pick<Profile, 'id' | 'full_name'>[]> = {}
    for (const row of (ug ?? []) as unknown as { group_id: string; profiles: Pick<Profile, 'id' | 'full_name'> }[]) {
      if (!byGroup[row.group_id]) byGroup[row.group_id] = []
      if (row.profiles) byGroup[row.group_id].push(row.profiles)
    }

    const enriched: GroupWithCount[] = ((grps ?? []) as Group[]).map(g => ({
      ...g,
      member_count: byGroup[g.id]?.length ?? 0,
      members: byGroup[g.id] ?? [],
    }))

    setGroups(enriched)
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  function openNew() {
    setEditing(null)
    setForm({ name: '', description: '' })
    setFormError(null)
    setShowModal(true)
  }

  function openEdit(g: Group) {
    setEditing(g)
    setForm({ name: g.name, description: g.description ?? '' })
    setFormError(null)
    setShowModal(true)
  }

  async function handleSave() {
    setSaving(true)
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio')
      setSaving(false)
      return
    }

    if (editing) {
      const { error } = await supabase
        .from('groups')
        .update({ name: form.name.trim(), description: form.description || null })
        .eq('id', editing.id)
      if (error) { setFormError('Error al actualizar'); setSaving(false); return }
    } else {
      const { error } = await supabase
        .from('groups')
        .insert({ name: form.name.trim(), description: form.description || null })
      if (error) { setFormError('Error al crear grupo'); setSaving(false); return }
    }

    setShowModal(false)
    await load()
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este grupo? Los trabajadores no serán eliminados.')) return
    await fetch(`/api/groups?id=${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="px-4 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Grupos</h1>
        <button onClick={openNew} className="btn-primary py-2.5 px-4 text-sm flex items-center gap-1.5">
          <Plus size={18} />Nuevo
        </button>
      </div>

      <p className="text-sm text-gray-500">
        Los grupos permiten asignar ubicaciones de obra a conjuntos de trabajadores.
      </p>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay grupos creados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <div key={g.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="bg-orange-100 rounded-lg p-2">
                      <Users size={18} className="text-orange-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{g.name}</p>
                      {g.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{g.description}</p>
                      )}
                    </div>
                  </div>

                  {g.members.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {g.members.slice(0, 5).map(m => (
                        <span key={m.id} className="badge-gray">{m.full_name}</span>
                      ))}
                      {g.members.length > 5 && (
                        <span className="badge-gray">+{g.members.length - 5} más</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-1 flex-shrink-0">
                  <span className="badge-blue self-start">{g.member_count} miembros</span>
                  <button onClick={() => openEdit(g)} className="p-2 text-gray-400 hover:text-orange-500 transition-colors">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDelete(g.id)} className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end">
          <div className="bg-white w-full max-w-2xl mx-auto rounded-t-3xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-lg">
                {editing ? 'Editar grupo' : 'Nuevo grupo'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 p-1">
                <X size={22} />
              </button>
            </div>
            <div className="px-5 py-4 pb-8 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Nombre del grupo *</label>
                <input className="input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Equipo Norte" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1.5 block">Descripción</label>
                <input className="input" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Descripción opcional" />
              </div>
              {formError && <p className="bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">{formError}</p>}
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
