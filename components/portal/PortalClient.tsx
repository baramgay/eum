'use client'

import { useEffect, useState } from 'react'
import DatasetModal from './DatasetModal'

interface CatalogItem {
  dataset_id: string
  title: string
  theme: string
  format: string
  license: string
  quality_summary: string | null
  description: string | null
  updated_at: string | null
  rows: number | null
  keywords?: string | null
  is_open?: boolean
  ai_ready?: boolean
  api_enabled?: boolean
}

interface CatalogResponse {
  items: CatalogItem[]
  total: number
  page: number
  pageSize: number
  themes?: string[]
}

const SORT_OPTIONS = [
  { value: 'updated_at', label: '최신순' },
  { value: 'title',      label: '이름순' },
  { value: 'rows',       label: '데이터 크기순' },
  { value: 'high_value', label: '활용도순' },
]

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-5 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
      <div className="h-3 bg-gray-100 rounded w-full mb-2" />
      <div className="h-3 bg-gray-100 rounded w-2/3 mb-4" />
      <div className="flex gap-2">
        <div className="h-5 bg-gray-100 rounded-full w-16" />
        <div className="h-5 bg-gray-100 rounded-full w-12" />
      </div>
    </div>
  )
}

export default function PortalClient() {
  const [items, setItems]               = useState<CatalogItem[]>([])
  const [total, setTotal]               = useState(0)
  const [page, setPage]                 = useState(1)
  const [pageSize, setPageSize]         = useState(20)
  const [themes, setThemes]             = useState<string[]>([])
  const [searchInput, setSearchInput]   = useState('')
  const [query, setQuery]               = useState('')
  const [sort, setSort]                 = useState('updated_at')
  const [activeTheme, setActiveTheme]   = useState('')
  const [onlyAiReady, setOnlyAiReady]   = useState(false)
  const [loading, setLoading]           = useState(true)
  const [selectedDataset, setSelectedDataset] = useState<CatalogItem | null>(null)

  // 검색 디바운스 (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // 테마 변경 시 페이지 초기화
  useEffect(() => {
    setPage(1)
  }, [activeTheme, sort])

  // 데이터 패치
  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ sort, page: String(page) })
    if (query.trim())  params.set('q', query.trim())
    if (activeTheme)   params.set('theme', activeTheme)
    if (onlyAiReady)   params.set('ai_ready', 'true')

    fetch(`/api/catalog?${params}`)
      .then(r => r.json())
      .then((d: CatalogResponse | CatalogItem[]) => {
        // 구버전 응답(배열) 호환 처리
        if (Array.isArray(d)) {
          setItems(d)
          setTotal(d.length)
          setPageSize(20)
        } else {
          setItems(d.items ?? [])
          setTotal(d.total ?? 0)
          setPage(d.page ?? 1)
          setPageSize(d.pageSize ?? 20)
          if (d.themes && d.themes.length > 0) setThemes(d.themes)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [query, sort, activeTheme, page, onlyAiReady])

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-4">
      {selectedDataset && (
        <DatasetModal item={selectedDataset} onClose={() => setSelectedDataset(null)} />
      )}

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">데이터 포털</h2>
        <span className="text-sm text-gray-400">
          {loading ? '로딩 중...' : `전체 ${total.toLocaleString()}개 데이터셋`}
        </span>
      </div>

      {/* 검색 + 정렬 */}
      <div className="flex gap-2">
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="데이터셋 검색..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* 테마 필터 탭 + AI-Ready 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        {themes.length > 0 && (
          <>
            <button
              onClick={() => setActiveTheme('')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeTheme === ''
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              전체
            </button>
            {themes.map(t => (
              <button
                key={t}
                onClick={() => setActiveTheme(activeTheme === t ? '' : t)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeTheme === t
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t}
              </button>
            ))}
            <div className="w-px h-4 bg-gray-200 mx-1" />
          </>
        )}
        <button
          onClick={() => { setOnlyAiReady(v => !v); setPage(1) }}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            onlyAiReady
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          ✦ AI-Ready
        </button>
      </div>

      {/* 카드 그리드 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-400">검색 결과가 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <div
              key={item.dataset_id}
              onClick={() => setSelectedDataset(item)}
              className="bg-white rounded-lg border p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                  {item.theme}
                </span>
                <span className="text-xs text-gray-400">{item.format}</span>
              </div>
              <h3 className="font-medium text-gray-800 text-sm mb-1">{item.title}</h3>
              {item.description && (
                <p className="text-xs text-gray-500 line-clamp-2">{item.description}</p>
              )}
              <div className="mt-3 flex items-center justify-between gap-1 flex-wrap">
                <span className="text-xs text-gray-400">
                  {item.rows != null ? `${item.rows.toLocaleString()}행` : ''}
                </span>
                <div className="flex items-center gap-1 flex-wrap justify-end">
                  {item.ai_ready && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                      AI-Ready
                    </span>
                  )}
                  {item.api_enabled && (
                    <span className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">
                      API
                    </span>
                  )}
                  {item.quality_summary && (
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        item.quality_summary.includes('통과')
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {item.quality_summary.includes('통과') ? '품질 통과' : '품질 확인 필요'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 페이지네이션 — total > pageSize일 때만 표시 */}
      {!loading && total > pageSize && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-4 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            이전
          </button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-4 py-1.5 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            다음
          </button>
        </div>
      )}
    </div>
  )
}
