'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { BarChart2, Play, Star, ArrowRight } from 'lucide-react'
import Card from '@/components/ui/Card'
import Btn from '@/components/ui/Btn'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import { ANALYSIS_TYPE_LABEL } from '../DashboardClient'

const LS_KEY = 'eum:analysis_favorites'
const MAX_FAVORITES = 3

export interface AnalysisFavorite {
  id: string
  dataset_id: string
  dataset_label: string
  analysis_type: string
  params: Record<string, string>
  saved_at: string
}

function loadFavorites(): AnalysisFavorite[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAnalysisFavorite(fav: Omit<AnalysisFavorite, 'id' | 'saved_at'>): void {
  const existing = loadFavorites()
  const newFav: AnalysisFavorite = {
    ...fav,
    id: `${fav.dataset_id}_${fav.analysis_type}_${Date.now()}`,
    saved_at: new Date().toISOString(),
  }
  const updated = [newFav, ...existing].slice(0, MAX_FAVORITES)
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(updated))
  } catch {}
}

export function removeAnalysisFavorite(id: string): void {
  const updated = loadFavorites().filter(f => f.id !== id)
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(updated))
  } catch {}
}

function buildPresetUrl(fav: AnalysisFavorite): string {
  const params = new URLSearchParams({
    preset:        fav.id,
    dataset_id:    fav.dataset_id,
    analysis_type: fav.analysis_type,
    ...fav.params,
  })
  return `/analytics?${params.toString()}`
}

function timeAgoShort(isoStr: string): string {
  const diffMs = Date.now() - new Date(isoStr).getTime()
  const m = Math.floor(diffMs / 60000)
  if (m < 60)  return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}시간 전`
  return `${Math.floor(h / 24)}일 전`
}

export default function AnalysisFavoritesWidget() {
  const router = useRouter()
  const [favorites, setFavorites] = useState<AnalysisFavorite[]>([])
  const [mounted, setMounted]     = useState(false)

  useEffect(() => {
    setFavorites(loadFavorites())
    setMounted(true)
  }, [])

  const handleRemove = useCallback((id: string) => {
    removeAnalysisFavorite(id)
    setFavorites(loadFavorites())
  }, [])

  const handleRun = useCallback((fav: AnalysisFavorite) => {
    router.push(buildPresetUrl(fav))
  }, [router])

  if (!mounted) return null

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">분석 바로가기</h3>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => router.push('/analytics')}>
          분석 탭
          <ArrowRight className="w-3.5 h-3.5" />
        </Btn>
      </div>

      {favorites.length === 0 ? (
        <EmptyState
          icon={<BarChart2 className="w-6 h-6 text-gray-300 dark:text-gray-600" />}
          title="저장된 분석이 없습니다"
          description="분석 탭에서 즐겨찾기를 추가하면 여기에 최대 3개까지 표시됩니다."
          action={{ label: '분석 바로가기', onClick: () => router.push('/analytics') }}
        />
      ) : (
        <ul className="space-y-2">
          {favorites.map(fav => (
            <li
              key={fav.id}
              className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2.5"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Badge variant="purple">
                    {ANALYSIS_TYPE_LABEL[fav.analysis_type] ?? fav.analysis_type}
                  </Badge>
                  <span className="text-xs text-gray-400 dark:text-gray-300">{timeAgoShort(fav.saved_at)}</span>
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-200 truncate">{fav.dataset_label}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleRun(fav)}
                  className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                >
                  <Play className="w-3 h-3" />
                  재실행
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(fav.id)}
                  className="text-xs text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 transition-colors px-1"
                  aria-label="즐겨찾기 제거"
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {favorites.length > 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-300 mt-3 text-right">
          최대 {MAX_FAVORITES}개 저장
        </p>
      )}
    </Card>
  )
}
