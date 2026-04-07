'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatTime, calcHours, distanceLabel } from '@/lib/utils'
import type { CheckIn } from '@/types'
import { ArrowLeft, Clock, MapPin, AlertTriangle, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface DayGroup {
  date: string
  checkIns: CheckIn[]
  hoursWorked?: string
}

export default function HistoryPage() {
  const supabase = createClient()
  const router = useRouter()

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

    // Agrupar por día
    const byDay: Record<string, CheckIn[]> = {}
    for (const ci of (data ?? []) as CheckIn[]) {
      const day = ci.timestamp.slice(0, 10)
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(ci)
    }

    const newGroups: DayGroup[] = Object.entries(byDay).map(([date, checkIns]) => {
      const entryIn  = checkIns.find(c => c.type === 'in')
      const entryOut = checkIns.find(c => c.type === 'out')
      const hoursWorked = entryIn && entryOut
        ? calcHours(entryIn.timestamp, entryOut.timestamp)
        : undefined
      return { date, checkIns, hoursWorked }
    })

    setGroups(prev => pageNum === 0 ? newGroups : [...prev, ...newGroups])
    setLoading(false)
  }

  useEffect(() => { loadHistory(0) }, []) // eslint-disable-line

  function loadMore() {
    const next = page + 1
    setPage(next)
    loadHistory(next)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 pt-12 pb-4 safe-top sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/worker" className="p-2 -ml-2 text-gray-600">
            <ArrowLeft size={22} />
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Historial de fichajes</h1>
        </div>
      </header>

      <main className="px-4 py-4 space-y-3 pb-10">
        {groups.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Clock size={40} className="mx-auto mb-3 opacity-40" />
            <p>Sin historial de fichajes</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.date} className="card">
              {/* Cabecera del día */}
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-gray-900 capitalize text-sm">
                  {formatDate(group.date)}
                </p>
                {group.hoursWorked && (
                  <span className="badge-blue flex items-center gap-1">
                    <Clock size={12} />
                    {group.hoursWorked}
                  </span>
                )}
              </div>

              {/* Fichajes del día */}
              <div className="space-y-2">
                {group.checkIns.map((ci) => (
                  <div key={ci.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={ci.type === 'in' ? 'badge-green' : 'badge-red'}>
                        {ci.type === 'in' ? 'Entrada' : 'Salida'}
                      </span>
                      {!ci.within_radius && (
                        <span className="badge-orange flex items-center gap-1">
                          <AlertTriangle size={10} />
                          Fuera radio
                        </span>
                      )}
                      {ci.manually_modified && (
                        <span className="badge-gray">Modificado</span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatTime(ci.timestamp)}
                      </p>
                      {ci.distance_meters !== null && (
                        <p className="text-xs text-gray-400 flex items-center gap-1 justify-end">
                          <MapPin size={10} />
                          {distanceLabel(ci.distance_meters)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Nota del admin si hay */}
              {group.checkIns.some(c => c.notes) && (
                <div className="mt-2 bg-amber-50 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">
                    Nota: {group.checkIns.find(c => c.notes)?.notes}
                  </p>
                </div>
              )}
            </div>
          ))
        )}

        {hasMore && !loading && (
          <button
            onClick={loadMore}
            className="btn-secondary w-full text-sm"
          >
            Cargar más
          </button>
        )}
      </main>
    </div>
  )
}
