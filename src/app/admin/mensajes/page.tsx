'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, initials, avatarColor } from '@/lib/utils'
import {
  MessageSquare, Send, Loader2, AlertTriangle, ArrowLeft, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  body: string
  is_from_admin: boolean
  worker_id: string
  created_at: string
  read_at: string | null
}

interface Conversation {
  worker_id: string
  worker: { id: string; full_name: string; avatar_url: string | null }
  last_message: string
  last_at: string
  unread_count: number
  is_from_admin: boolean
}

function formatMsgTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function WorkerAvatar({ name, avatar }: { name: string; avatar?: string | null }) {
  if (avatar) return <img src={avatar} alt={name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
  return (
    <div className={`${avatarColor(name)} w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
      {initials(name)}
    </div>
  )
}

export default function AdminMensajesPage() {
  const supabase = useRef(createClient()).current
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected]           = useState<Conversation | null>(null)
  const [messages, setMessages]           = useState<Message[]>([])
  const [loadingList, setLoadingList]     = useState(true)
  const [loadingChat, setLoadingChat]     = useState(false)
  const [text, setText]                   = useState('')
  const [sending, setSending]             = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [search, setSearch]               = useState('')
  const bottomRef                         = useRef<HTMLDivElement>(null)
  const tokenRef                          = useRef<string | undefined>(undefined)

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    tokenRef.current = session?.access_token
    return session?.access_token
  }, [supabase])

  const loadConversations = useCallback(async () => {
    const token = await getToken()
    const res = await fetch('/api/messages', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const json = await res.json()
    setConversations((json.data ?? []) as Conversation[])
    setLoadingList(false)
  }, [getToken])

  const loadChat = useCallback(async (workerId: string) => {
    setLoadingChat(true)
    const token = tokenRef.current
    const res = await fetch(`/api/messages?worker_id=${workerId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    const json = await res.json()
    setMessages((json.data ?? []) as Message[])
    setLoadingChat(false)
    // Actualizar conversaciones para borrar unread
    loadConversations()
  }, [loadConversations])

  useEffect(() => { loadConversations() }, [loadConversations])

  useEffect(() => {
    if (selected) loadChat(selected.worker_id)
  }, [selected, loadChat])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime — refrescar chat y lista cuando llega mensaje nuevo
  useEffect(() => {
    const channel = supabase
      .channel('admin-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as Message
        if (selected && msg.worker_id === selected.worker_id) {
          setMessages(prev => [...prev, msg])
        }
        loadConversations()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, selected, loadConversations])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || !selected) return
    setSending(true)
    setError(null)
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}),
      },
      body: JSON.stringify({ body, worker_id: selected.worker_id }),
    })
    const json = await res.json()
    setSending(false)
    if (!res.ok) { setError(json.error ?? 'Error al enviar'); return }
    setText('')
    await loadChat(selected.worker_id)
  }

  const filteredConvs = conversations.filter(c =>
    !search || c.worker?.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalUnread = conversations.reduce((acc, c) => acc + (c.unread_count ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <MessageSquare size={20} className="text-blue-400" />
          Mensajes
          {totalUnread > 0 && (
            <span className="ml-1 bg-blue-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
              {totalUnread}
            </span>
          )}
        </h1>
        <p className="text-zinc-500 text-sm mt-0.5">Comunicación directa con trabajadores</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-[600px]">

        {/* ── Lista de conversaciones ── */}
        <div className={cn(
          'lg:col-span-1 card p-0 overflow-hidden flex flex-col',
          selected && 'hidden lg:flex'
        )}>
          <div className="p-3 border-b border-zinc-800">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Buscar trabajador…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input pl-8 py-1.5 text-sm w-full"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-800">
            {loadingList ? (
              <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-zinc-500 animate-spin" /></div>
            ) : filteredConvs.length === 0 ? (
              <div className="text-center py-12 text-zinc-600">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Sin conversaciones</p>
              </div>
            ) : (
              filteredConvs.map(conv => (
                <button
                  key={conv.worker_id}
                  onClick={() => setSelected(conv)}
                  className={cn(
                    'w-full flex items-start gap-3 px-4 py-3.5 hover:bg-zinc-800/50 transition-colors text-left',
                    selected?.worker_id === conv.worker_id && 'bg-zinc-800'
                  )}
                >
                  <div className="relative">
                    <WorkerAvatar name={conv.worker?.full_name ?? ''} avatar={conv.worker?.avatar_url} />
                    {conv.unread_count > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                        {conv.unread_count > 9 ? '9+' : conv.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('text-sm font-semibold truncate', conv.unread_count > 0 ? 'text-white' : 'text-zinc-300')}>
                        {conv.worker?.full_name ?? '—'}
                      </p>
                      <p className="text-[10px] text-zinc-600 flex-shrink-0">{formatMsgTime(conv.last_at)}</p>
                    </div>
                    <p className={cn('text-xs truncate mt-0.5', conv.unread_count > 0 ? 'text-zinc-400' : 'text-zinc-600')}>
                      {conv.is_from_admin ? 'Tú: ' : ''}{conv.last_message}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Ventana de chat ── */}
        <div className={cn(
          'lg:col-span-2 card p-0 overflow-hidden flex flex-col',
          !selected && 'hidden lg:flex'
        )}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-zinc-600">
              <div className="text-center">
                <MessageSquare size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Selecciona una conversación</p>
              </div>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-800 bg-zinc-900">
                <button
                  onClick={() => setSelected(null)}
                  className="lg:hidden p-1.5 text-zinc-500 hover:text-white rounded-lg"
                >
                  <ArrowLeft size={18} />
                </button>
                <WorkerAvatar name={selected.worker?.full_name ?? ''} avatar={selected.worker?.avatar_url} />
                <div>
                  <p className="text-sm font-semibold text-white">{selected.worker?.full_name}</p>
                  <p className="text-xs text-zinc-500">Trabajador</p>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
                {loadingChat ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-5 h-5 text-zinc-500 animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-10 text-zinc-600">
                    <p className="text-sm">Sin mensajes aún. Di hola!</p>
                  </div>
                ) : (
                  messages.map(msg => (
                    <div key={msg.id} className={cn('flex', msg.is_from_admin ? 'justify-end' : 'justify-start')}>
                      <div className={cn(
                        'max-w-[75%] rounded-2xl px-4 py-2.5 space-y-1',
                        msg.is_from_admin
                          ? 'bg-white text-zinc-950 rounded-tr-sm'
                          : 'bg-zinc-800 text-zinc-100 rounded-tl-sm'
                      )}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                        <p className="text-[10px] text-zinc-500">{formatMsgTime(msg.created_at)}</p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div className="px-4 py-3 border-t border-zinc-800">
                {error && (
                  <div className="flex items-center gap-2 text-xs text-red-400 mb-2">
                    <AlertTriangle size={12} />{error}
                  </div>
                )}
                <form onSubmit={sendMessage} className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as unknown as React.FormEvent) }
                    }}
                    placeholder={`Escribe a ${selected.worker?.full_name?.split(' ')[0]}…`}
                    rows={1}
                    className="input flex-1 resize-none text-sm py-2.5 max-h-32"
                    style={{ overflowY: 'auto' }}
                  />
                  <button
                    type="submit"
                    disabled={sending || !text.trim()}
                    className="p-2.5 rounded-xl bg-white text-zinc-950 hover:bg-zinc-200 disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
