'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatTime, calcHours, distanceLabel } from '@/lib/utils'
import type { CheckIn } from '@/types'
import { ArrowLeft, Clock, MapPin, AlertTriangle, Loader2, Building2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface DayGroup {
  date: string
  checkIns: CheckIn[]
  hoursWorked?: string
}

export default function HistoryPage() {
  const supabase  = createClient()
  const router    = useRouter()

  const [groups, setGroups]   = useState<DayGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage]       = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const PAGE_SIZE = 30

  async function loadHistory(pageNum: number) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data } = await supabase
      .from('check_ins')
      .select('id,type,timestamp,distance_meters,within_radius,work_location_id,manually_modified,notes')
      .eq('worker_id', user.id)
      .order('timestamp', { ascending: false })
      .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

    if (!data || data.length < PAGE_SIZE) setHasMore(false)

    const byDay: Record<string, CheckIn[]> = {}
    for (const ci of (data ?? []) as CheckIn[]) {
      const day = ci.timestamp.slice(0, 10)
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(ci)
    }

    const newGroups: DayGroup[] = Object.entries(byDay).map(([date, checkIns]) => {
      const entryIn  = checkIns.find(c => c.type === 'in')
      const entryOut = checkIns.find(c => c.type === 'out')
      return {
        date,
        checkIns,
        hoursWorked: entryIn && entryOut ? calcHours(entryIn.timestamp, entryOut.timestamp) : undefined,
      }
    })

    setGroups(prev => pageNum === 0 ? newGroups : [...prev, ...newGroups])
    setLoading(false)
  }

  useEffect(() => { loadHistory(0) }, []) // eslint-disable-line

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-zinc-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 max-w-md mx-auto">

      {/* ── Header ── */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 pt-12 pb-4 safe-top sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/worker" className="p-2 -ml-2 text-zinc-500 hover:text-white transition-colors rounded-xl hover:bg-zinc-800">
            <ArrowLeft size={20} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white rounded-md flex items-center justify-center">
              <Building2 size={12} className="text-zinc-950" strokeWidth={2} />
            </div>
            <h1 className="text-base font-bold text-white">Historial de fichajes</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 space-y-3 pb-12">
        {groups.length === 0 ? (
          <div className="text-center py-16 text-zinc-600">
            <Clock size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Sin historial de fichajes</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.date} className="card">
              {/* Cabecera del día */}
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-zinc-200 text-sm capitalize">
                  {formatDate(group.date)}
                </p>
                {group.hoursWorked && (
                  <span className="badge-white flex items-center gap-1">
                    <Clock size={11} />{group.hoursWorked}
                  </span>
                )}
              </div>

              {/* Fichajes del día */}
              <div className="space-y-0">
                {group.checkIns.map((ci) => (
                  <div key={ci.id} className="flex items-center justify-between py-2.5 border-b border-zinc-800 last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={ci.type === 'in' ? 'badge-green' : 'badge-red'}>
                        {ci.type === 'in' ? 'Entrada' : 'Salida'}
                      </span>
                      {!ci.within_radius && (
                        <span className="badge-orange">
                          <AlertTriangle size={9} />Fuera radio
                        </span>
                      )}
                      {ci.manually_modified && <span className="badge-gray">Modificado</span>}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-zinc-200">{formatTime(ci.timestamp)}</p>
                      {ci.distance_meters !== null && (
                        <p className="text-xs text-zinc-600 flex items-center gap-1 justify-end">
                          <MapPin size={9} />{distanceLabel(ci.distance_meters)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {group.checkIns.some(c => c.notes) && (
                <div className="mt-2.5 bg-amber-500/10 border border-amber-500/15 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-400">
                    Nota: {group.checkIns.find(c => c.notes)?.notes}
                  </p>
                </div>
              )}
            </div>
          ))
        )}

        {hasMore && !loading && (
          <button
            onClick={() => { const n = page + 1; setPage(n); loadHistory(n) }}
            className="btn-secondary w-full"
          >
            Cargar más
          </button>
        )}
      </main>
    </div>
  )
}
