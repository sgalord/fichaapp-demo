'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Group, Profile } from '@/types'
import { Plus, Trash2, Users, Loader2, X, Edit2 } from 'lucide-react'
import { initials, avatarColor } from '@/lib/utils'

interface GroupWithCount extends Group {
  member_count: number
  members: Pick<Profile, 'id' | 'full_name'>[]
}

export default function GroupsPage() {
  const supabase = createClient()
  const [groups, setGroups]       = useState<GroupWithCount[]>([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState<Group | null>(null)
  const [form, setForm]           = useState({ name: '', description: '' })
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data: grps } = await supabase.from('groups').select('id, name, description, created_at').order('name')
    const { data: ug }   = await supabase.from('user_groups').select('group_id, user_id, profiles!user_id(id, full_name)')

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
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); setSaving(false); return }
    if (editing) {
      const { error } = await supabase.from('groups').update({ name: form.name.trim(), description: form.description || null }).eq('id', editing.id)
      if (error) { setFormError('Error al actualizar'); setSaving(false); return }
    } else {
      const { error } = await supabase.from('groups').insert({ name: form.name.trim(), description: form.description || null })
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
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Grupos</h1>
          <p className="text-zinc-500 text-sm mt-0.5">Asigna obras a conjuntos de trabajadores</p>
        </div>
        <button onClick={openNew} className="btn-primary gap-2">
          <Plus size={16} />Nuevo
        </button>
      </div>

      {/* ── Lista ── */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-3">No hay grupos creados</p>
          <button onClick={openNew} className="btn-secondary gap-2">
            <Plus size={15} />Crear grupo
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(g => (
            <div key={g.id} className="card">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Users size={18} className="text-zinc-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zinc-200">{g.name}</p>
                  {g.description && <p className="text-xs text-zinc-500 mt-0.5">{g.description}</p>}
                  <span className="badge-blue mt-1.5">{g.member_count} miembros</span>
                </div>
              </div>

              {g.members.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                  {g.members.slice(0, 4).map(m => (
                    <div key={m.id} title={m.full_name}
                      className={`${avatarColor(m.full_name)} w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold`}>
                      {initials(m.full_name)}
                    </div>
                  ))}
                  {g.members.length > 4 && (
                    <span className="text-xs text-zinc-500">+{g.members.length - 4} más</span>
                  )}
                </div>
              )}

              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-zinc-800">
                <button onClick={() => openEdit(g)} className="btn-ghost text-xs gap-1 flex-1 justify-center">
                  <Edit2 size={13} /> Editar
                </button>
                <button onClick={() => handleDelete(g.id)} className="btn-ghost text-xs gap-1 flex-1 justify-center text-red-500 hover:text-red-400 hover:bg-red-500/10">
                  <Trash2 size={13} /> Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 className="font-semibold text-white">{editing ? 'Editar grupo' : 'Nuevo grupo'}</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Nombre del grupo *</label>
                <input className="input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ej: Equipo Norte" />
              </div>
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Descripción</label>
                <input className="input" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Descripción opcional" />
              </div>
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
