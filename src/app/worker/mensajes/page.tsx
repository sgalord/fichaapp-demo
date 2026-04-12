'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, MessageSquare, Send, Loader2, AlertTriangle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  body: string
  is_from_admin: boolean
  created_at: string
  read_at: string | null
}

function formatMsgTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

export default function WorkerMensajesPage() {
  const supabase = useRef(createClient()).current
  const router   = useRouter()

  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading]   = useState(true)
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const bottomRef               = useRef<HTMLDivElement>(null)
  const tokenRef                = useRef<string | undefined>(undefined)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: { session } } = await supabase.auth.getSession()
    tokenRef.current = session?.access_token

    const res = await fetch('/api/messages', {
      headers: tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {},
    })
    const json = await res.json()
    setMessages((json.data ?? []) as Message[])
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { load() }, [load])

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('worker-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        load()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, load])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setSending(true)
    setError(null)
    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(tokenRef.current ? { Authorization: `Bearer ${tokenRef.current}` } : {}),
      },
      body: JSON.stringify({ body }),
    })
    const json = await res.json()
    setSending(false)
    if (!res.ok) { setError(json.error ?? 'Error al enviar'); return }
    setText('')
    await load()
  }

  return (
    <div className="min-h-screen bg-zinc-950 max-w-md mx-auto flex flex-col">

      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 pt-12 pb-4 safe-top sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/worker" className="p-2 -ml-2 text-zinc-500 hover:text-white transition-colors rounded-xl hover:bg-zinc-800">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 bg-blue-500/20 rounded-md flex items-center justify-center">
              <MessageSquare size={13} className="text-blue-400" strokeWidth={2} />
            </div>
            <h1 className="text-base font-bold text-white">Mensajes</h1>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-1 pl-10">Comunicación directa con la administración</p>
      </header>

      {/* Messages area */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <MessageSquare size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aún no hay mensajes</p>
            <p className="text-xs mt-1 text-zinc-700">Escribe al administrador cualquier consulta</p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={cn('flex', msg.is_from_admin ? 'justify-start' : 'justify-end')}
            >
              <div className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2.5 space-y-1',
                msg.is_from_admin
                  ? 'bg-zinc-800 text-zinc-100 rounded-tl-sm'
                  : 'bg-white text-zinc-950 rounded-tr-sm'
              )}>
                {msg.is_from_admin && (
                  <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">Admin</p>
                )}
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                <p className={cn(
                  'text-[10px]',
                  msg.is_from_admin ? 'text-zinc-500' : 'text-zinc-500'
                )}>
                  {formatMsgTime(msg.created_at)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </main>

      {/* Input */}
      <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 px-4 py-3 safe-bottom">
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 mb-2">
            <AlertTriangle size={12} /> {error}
          </div>
        )}
        <form onSubmit={sendMessage} className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as unknown as React.FormEvent) }
            }}
            placeholder="Escribe un mensaje…"
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
    </div>
  )
}
