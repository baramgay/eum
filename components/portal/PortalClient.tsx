'use client'

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import DatasetModal from './DatasetModal'
import {
  Download,
  Calendar,
  Database,
  X,
  Building2,
  Search,
  FilterX,
  AlertCircle,
  Sparkles,
  Clock,
  TrendingUp,
} from 'lucide-react'
import { Card, Badge, Btn, EmptyState, Skeleton, StatCard, PageHeader } from '@/components/ui'

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
  download_count?: number
}

interface CatalogResponse {
  items: CatalogItem[]
  total: number
  page: number
  pageSize: number
  themes?: string[]
}

interface UsageSummary {
  topDownloads: { datasetId: string; title: string; count: number }[]
  recentDatasets: { datasetId: string; title: string; updatedAt: string }[]
}

function highlightText(text: string, query: string): ReactNode {
  if (!query.trim()) return text
  const terms = query.trim().split(/\s+/).filter(Boolean)
  const pattern = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = text.split(pattern)
  return parts.map((part, i) =>
    pattern.test(part)
      ? <mark key={i} className="bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-200 rounded-sm px-0.5">{part}</mark>
      : part
  )
}

const SORT_OPTIONS = [
  { value: 'updated_at', label: '최신순' },
  { value: 'title',      label: '이름순' },
  { value: 'rows',       label: '데이터 크기순' },
  { value: 'high_value', label: '활용도순' },
]

function DatasetCardSkeleton() {
  return (
    <Card padding="sm" className="space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
      <div className="flex items-center justify-between pt-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
    </Card>
  )
}

function ActiveFilterChip({ label, icon, onRemove }: { label: string; icon?: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 pl-2 pr-1 py-1 rounded-full">
      {icon}
      {label}
      <button
        onClick={onRemove}
        className="hover:text-gray-900 dark:hover:text-gray-100 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-150"
        aria-label="필터 제거"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

export default function PortalClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenantId = searchParams.get('tenant_id') ?? ''
  const highlightId = searchParams.get('highlight') ?? ''

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
  const [error, setError]               = useState(false)
  const [retryCount, setRetryCount]     = useState(0)
  const [selectedDataset, setSelectedDataset] = useState<CatalogItem | null>(null)
  const [usage, setUsage]               = useState<UsageSummary | null>(null)
  const [tenantName, setTenantName]     = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // '/' 키 → 검색창 포커스
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' || selectedDataset) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      e.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedDataset])

  // 검색 디바운스 (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchInput)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // 테마/정렬 변경 시 페이지 초기화
  useEffect(() => {
    setPage(1)
  }, [activeTheme, sort])

  // 사용량 통계 로드
  useEffect(() => {
    fetch('/api/usage?period=month')
      .then(r => r.json())
      .then((d: UsageSummary) => setUsage(d))
      .catch(() => setUsage(null))
  }, [])

  // URL highlight 데이터셋 자동 열기
  useEffect(() => {
    if (!highlightId) return
    fetch(`/api/catalog/${encodeURIComponent(highlightId)}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: CatalogItem) => setSelectedDataset(d))
      .catch(() => {})
  }, [highlightId])

  // 기관 필터 이름 로드
  useEffect(() => {
    if (!tenantId) { setTenantName(''); return }
    fetch(`/api/tenants/${tenantId}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((d: { name?: string }) => setTenantName(d.name ?? tenantId))
      .catch(() => setTenantName(tenantId))
  }, [tenantId])

  // 데이터 패치
  useEffect(() => {
    setLoading(true)
    setError(false)
    const params = new URLSearchParams({ sort, page: String(page) })
    if (query.trim())  params.set('q', query.trim())
    if (activeTheme)   params.set('theme', activeTheme)
    if (onlyAiReady)   params.set('ai_ready', 'true')
    if (tenantId)      params.set('tenant_id', tenantId)

    fetch(`/api/catalog?${params}`)
      .then(r => r.json())
      .then((d: CatalogResponse | CatalogItem[]) => {
        let fetched: CatalogItem[] = []
        let fetchedTotal = 0
        let fetchedPage = page
        let fetchedPageSize = 20
        let fetchedThemes: string[] | undefined

        if (Array.isArray(d)) {
          fetched = d
          fetchedTotal = d.length
          fetchedPageSize = 20
        } else {
          fetched = d.items ?? []
          fetchedTotal = d.total ?? 0
          fetchedPage = d.page ?? 1
          fetchedPageSize = d.pageSize ?? 20
          fetchedThemes = d.themes
        }

        // 사용량 맵핑
        const countMap = new Map(usage?.topDownloads.map(u => [u.datasetId, u.count]))
        const enriched = fetched.map(item => ({
          ...item,
          download_count: countMap.get(item.dataset_id) ?? 0,
        }))

        setItems(enriched)
        setTotal(fetchedTotal)
        setPage(fetchedPage)
        setPageSize(fetchedPageSize)
        if (fetchedThemes && fetchedThemes.length > 0) setThemes(fetchedThemes)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
        setError(true)
      })
  }, [query, sort, activeTheme, page, onlyAiReady, usage, tenantId, retryCount])

  const totalPages = Math.ceil(total / pageSize)

  const clearFilters = () => {
    setSearchInput('')
    setQuery('')
    setActiveTheme('')
    setOnlyAiReady(false)
    if (tenantId) router.push('/portal')
  }

  const hasFilters = Boolean(query || activeTheme || onlyAiReady || tenantId)

  const aiReadyCount = items.filter(i => i.ai_ready).length
  const topDownloadCount = usage?.topDownloads?.[0]?.count ?? 0
  const recentUpdateCount = usage?.recentDatasets?.length ?? 0

  return (
    <div className="space-y-4">
      {selectedDataset && (
        <DatasetModal item={selectedDataset} onClose={() => setSelectedDataset(null)} />
      )}

      <PageHeader
        title="데이터 포털"
        action={
          <Badge variant="gray">
            {loading ? '로딩 중...' : `전체 ${total.toLocaleString()}개 데이터셋`}
          </Badge>
        }
      />

      {/* 요약 KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="전체 데이터셋"
          value={loading ? '—' : total.toLocaleString()}
          icon={<Database className="w-5 h-5 text-blue-500" />}
          color="blue"
        />
        <StatCard
          label="AI-Ready"
          value={loading ? '—' : aiReadyCount.toLocaleString()}
          icon={<Sparkles className="w-5 h-5 text-purple-500" />}
          color="purple"
        />
        <StatCard
          label="이번 달 신규·업데이트"
          value={loading ? '—' : recentUpdateCount.toLocaleString()}
          icon={<Clock className="w-5 h-5 text-green-500" />}
          color="green"
        />
        <StatCard
          label="최다 다운로드"
          value={loading ? '—' : topDownloadCount.toLocaleString()}
          icon={<TrendingUp className="w-5 h-5 text-amber-500" />}
          color="amber"
        />
      </div>

      {/* 검색 + 정렬 + 필터 초기화 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
          <input
            ref={searchInputRef}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="데이터셋 검색... (/ 키)"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-900"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {hasFilters && (
          <Btn variant="ghost" size="sm" onClick={clearFilters}>
            <FilterX className="w-3.5 h-3.5" />
            초기화
          </Btn>
        )}
      </div>

      {/* 적용 중인 필터 */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {query && (
            <ActiveFilterChip
              label={`검색: ${query}`}
              onRemove={() => { setSearchInput(''); setQuery('') }}
            />
          )}
          {activeTheme && (
            <ActiveFilterChip label={activeTheme} onRemove={() => setActiveTheme('')} />
          )}
          {onlyAiReady && (
            <ActiveFilterChip label="AI-Ready" onRemove={() => setOnlyAiReady(false)} />
          )}
          {tenantId && (
            <ActiveFilterChip
              label={tenantName || tenantId}
              icon={<Building2 className="w-3 h-3" />}
              onRemove={() => router.push('/portal')}
            />
          )}
        </div>
      )}

      {/* 테마 필터 탭 + AI-Ready 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        {themes.length > 0 && (
          <>
            <Btn
              variant={activeTheme === '' ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setActiveTheme('')}
              className="rounded-full"
            >
              전체
            </Btn>
            {themes.map(t => (
              <Btn
                key={t}
                variant={activeTheme === t ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setActiveTheme(activeTheme === t ? '' : t)}
                className="rounded-full"
              >
                {t}
              </Btn>
            ))}
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          </>
        )}
        <button
          onClick={() => { setOnlyAiReady(v => !v); setPage(1) }}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            onlyAiReady
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          ✦ AI-Ready
        </button>
      </div>

      {/* 카드 그리드 */}
      {error ? (
        <EmptyState
          icon={<AlertCircle className="w-8 h-8 text-red-500" />}
          title="데이터를 불러오지 못했습니다"
          description="잠시 후 다시 시도해주세요."
          action={{ label: '다시 시도', onClick: () => setRetryCount(c => c + 1) }}
        />
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <DatasetCardSkeleton key={i} />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Search className="w-8 h-8 text-gray-400 dark:text-gray-300" />}
          title="검색 결과가 없습니다"
          description="다른 키워드나 필터를 조정해 보세요."
          action={{ label: '필터 초기화', onClick: clearFilters }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(item => (
            <Card
              key={item.dataset_id}
              padding="sm"
              hover
              onClick={() => setSelectedDataset(item)}
              className="flex flex-col"
            >
              <div className="flex items-start justify-between mb-2">
                <Badge variant="blue">{item.theme}</Badge>
                <Badge variant="gray">{item.format}</Badge>
              </div>
              <h3 className="font-medium text-gray-800 dark:text-gray-200 text-sm mb-1">
                {highlightText(item.title, query)}
              </h3>
              {item.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                  {highlightText(item.description, query)}
                </p>
              )}
              {item.keywords && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {item.keywords.split(',').map(k => k.trim()).filter(Boolean).slice(0, 3).map(k => (
                    <button
                      key={k}
                      onClick={e => { e.stopPropagation(); setSearchInput(k); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                      className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 px-1.5 py-0.5 rounded transition-colors duration-150"
                    >
                      #{highlightText(k, query)}
                    </button>
                  ))}
                </div>
              )}

              {/* 메타 뱃지 행 */}
              <div className="mt-auto space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <Database className="w-3.5 h-3.5" />
                    {item.rows != null ? `${item.rows.toLocaleString()}행` : '—'}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="w-3.5 h-3.5" />
                    {(item.download_count ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-300">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {item.updated_at
                      ? new Date(item.updated_at).toLocaleDateString('ko-KR')
                      : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap justify-between pt-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {item.ai_ready && (
                      <Badge variant="purple">AI-Ready</Badge>
                    )}
                    {item.api_enabled && (
                      <Badge variant="blue">API</Badge>
                    )}
                    {item.quality_summary && (
                      <Badge variant={item.quality_summary.includes('통과') ? 'green' : 'amber'}>
                        {item.quality_summary.includes('통과') ? '품질 통과' : '품질 확인 필요'}
                      </Badge>
                    )}
                  </div>
                  <Btn
                    variant="secondary"
                    size="sm"
                    onClick={e => { e.stopPropagation(); setSelectedDataset(item) }}
                  >
                    상세보기
                  </Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* 페이지네이션 — total > pageSize일 때만 표시 */}
      {!loading && !error && total > pageSize && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Btn
            variant="secondary"
            size="sm"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            이전
          </Btn>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {page} / {totalPages}
          </span>
          <Btn
            variant="secondary"
            size="sm"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            다음
          </Btn>
        </div>
      )}
    </div>
  )
}
