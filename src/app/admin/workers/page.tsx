'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { initials, avatarColor } from '@/lib/utils'
import type { Profile, Group } from '@/types'
import {
  Plus, Search, Edit2, UserX, UserCheck,
  Loader2, X, Eye, EyeOff, ChevronDown, Users, Mail, Camera,
} from 'lucide-react'

type WorkerWithGroups = Profile & { groups: Group[] }

async function compressAvatar(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const SIZE = 256
      const canvas = document.createElement('canvas')
      canvas.width = SIZE; canvas.height = SIZE
      const ctx = canvas.getContext('2d')!
      const min = Math.min(img.width, img.height)
      ctx.drawImage(img, (img.width-min)/2, (img.height-min)/2, min, min, 0, 0, SIZE, SIZE)
      URL.revokeObjectURL(url)
      canvas.toBlob(b => (b ? resolve(b) : reject()), 'image/jpeg', 0.85)
    }
    img.onerror = reject; img.src = url
  })
}

export default function WorkersPage() {
  const supabase = createClient()

  const [workers, setWorkers]           = useState<WorkerWithGroups[]>([])
  const [groups, setGroups]             = useState<Group[]>([])
  const [query, setQuery]               = useState('')
  const [loading, setLoading]           = useState(true)
  const [showModal, setShowModal]       = useState(false)
  const [editing, setEditing]           = useState<WorkerWithGroups | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)
  const [uploadingId, setUploadingId]   = useState<string | null>(null)

  const [form, setForm] = useState({
    full_name: '', email: '', password: '', phone: '',
    role: 'worker', group_ids: [] as string[],
  })
  const [showPass, setShowPass]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, active, avatar_url, created_at, updated_at')
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
    setWorkers(((profiles ?? []) as Profile[]).map(p => ({ ...p, groups: groupsByUser[p.id] ?? [] })))
    setGroups((grps ?? []) as Group[])
    setLoading(false)
  }

  useEffect(() => { load() }, []) // eslint-disable-line

  function openNew() {
    setEditing(null)
    setForm({ full_name: '', email: '', password: '', phone: '', role: 'worker', group_ids: [] })
    setFormError(null); setShowModal(true)
  }

  async function openEdit(w: WorkerWithGroups) {
    setEditing(w)
    setForm({ full_name: w.full_name, email: '', password: '', phone: w.phone ?? '', role: w.role, group_ids: w.groups.map(g => g.id) })
    setFormError(null); setShowModal(true)
    setEmailLoading(true)
    try {
      const res = await fetch(`/api/workers/${w.id}`)
      if (res.ok) { const { email } = await res.json(); setForm(f => ({ ...f, email: email ?? '' })) }
    } finally { setEmailLoading(false) }
  }

  async function handleSave() {
    setSaving(true); setFormError(null)
    const res = await fetch(editing ? `/api/workers/${editing.id}` : '/api/workers', {
      method: editing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (!res.ok) { setFormError(json.error ?? 'Error al guardar'); setSaving(false); return }
    setShowModal(false); await load(); setSaving(false)
  }

  async function toggleActive(w: WorkerWithGroups) {
    await fetch(`/api/workers/${w.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !w.active }) })
    await load()
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>, workerId: string) {
    const file = e.target.files?.[0]; if (!file) return
    e.target.value = ''; setUploadingId(workerId)
    try {
      const blob = await compressAvatar(file)
      const filename = `${workerId}/avatar.jpg`
      await supabase.storage.from('avatars').remove([filename])
      const { error } = await supabase.storage.from('avatars').upload(filename, blob, { contentType: 'image/jpeg' })
      if (!error) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filename)
        await supabase.from('profiles').update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq('id', workerId)
        await load()
      }
    } finally { setUploadingId(null) }
  }

  const filtered = workers.filter(w =>
    w.full_name.toLowerCase().includes(query.toLowerCase()) || w.phone?.includes(query)
  )

  return (
    <div className="space-y-5 animate-fade-in">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Trabajadores</h1>
          <p className="text-zinc-500 text-sm mt-0.5">
            {workers.filter(w => w.active).length} activos · {workers.filter(w => !w.active).length} inactivos
          </p>
        </div>
        <button onClick={openNew} className="btn-primary gap-2"><Plus size={16} />Nuevo</button>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input type="search" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono..." className="input pl-10" />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {filtered.map(w => (
            <div key={w.id} className={`card flex items-center gap-3 ${!w.active ? 'opacity-50' : ''}`}>

              {/* Avatar con botón de subida */}
              <div className="relative flex-shrink-0">
                <input type="file" accept="image/*" id={`av-${w.id}`} className="hidden"
                  onChange={e => handleAvatarChange(e, w.id)} />
                <label htmlFor={`av-${w.id}`} className="cursor-pointer group relative block" title="Cambiar foto">
                  {w.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.avatar_url} alt={w.full_name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className={`${avatarColor(w.full_name)} w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold`}>
                      {uploadingId === w.id ? <Loader2 size={14} className="animate-spin" /> : initials(w.full_name)}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {uploadingId === w.id ? <Loader2 size={12} className="text-white animate-spin" /> : <Camera size={12} className="text-white" />}
                  </div>
                </label>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-zinc-200 text-sm truncate">{w.full_name}</p>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={w.role === 'worker' ? 'badge-gray' : 'badge-white'}>
                    {w.role === 'worker' ? 'Trabajador' : 'Admin'}
                  </span>
                  {!w.active && <span className="badge-red">Inactivo</span>}
                  {w.groups.slice(0, 2).map(g => <span key={g.id} className="badge-blue">{g.name}</span>)}
                  {w.groups.length > 2 && <span className="badge-gray">+{w.groups.length - 2}</span>}
                </div>
              </div>

              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(w)} className="p-2 text-zinc-500 hover:text-white transition-colors rounded-lg hover:bg-zinc-800"><Edit2 size={15} /></button>
                <button onClick={() => toggleActive(w)} className="p-2 text-zinc-500 hover:text-white transition-colors rounded-lg hover:bg-zinc-800" title={w.active ? 'Desactivar' : 'Activar'}>
                  {w.active ? <UserX size={15} /> : <UserCheck size={15} />}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-14 text-zinc-600">
              <Users size={36} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">{query ? 'No hay resultados' : 'Sin trabajadores registrados'}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end lg:items-center justify-center p-4 animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900">
              <h2 className="font-semibold text-white">{editing ? 'Editar trabajador' : 'Nuevo trabajador'}</h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white p-1"><X size={20} /></button>
            </div>
            <div className="px-5 py-5 space-y-4">

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Nombre completo *</label>
                <input className="input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Juan García" />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 flex items-center gap-1.5">
                  <Mail size={13} />{editing ? 'Email (modificar para cambiar)' : 'Email *'}
                </label>
                <div className="relative">
                  <input type="email" className="input" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    placeholder={emailLoading ? 'Cargando...' : 'juan@email.com'} disabled={emailLoading} />
                  {emailLoading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 animate-spin" />}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">
                  {editing ? 'Nueva contraseña (vacío = no cambiar)' : 'Contraseña *'}
                </label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} className="input pr-12" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                    {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Teléfono</label>
                <input type="tel" className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="600 000 000" />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-1.5 block">Rol</label>
                <div className="relative">
                  <select className="input appearance-none pr-10" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                    <option value="worker">Trabajador</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300 mb-2 block">Grupos</label>
                <div className="flex flex-wrap gap-2">
                  {groups.map(g => (
                    <button key={g.id} type="button"
                      onClick={() => setForm(f => ({ ...f, group_ids: f.group_ids.includes(g.id) ? f.group_ids.filter(id => id !== g.id) : [...f.group_ids, g.id] }))}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${form.group_ids.includes(g.id) ? 'bg-white text-zinc-950 border-white' : 'bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500'}`}
                    >{g.name}</button>
                  ))}
                  {groups.length === 0 && <p className="text-sm text-zinc-600">Sin grupos creados</p>}
                </div>
              </div>

              {formError && <p className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3">{formError}</p>}

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
