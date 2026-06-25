'use client'
import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  KeyRound, Bell, Copy, Check, RefreshCw, Trash2, Terminal, BarChart3,
  Search, X, AlertCircle,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import Btn from '@/components/ui/Btn'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'

interface ApiKey {
  key_id: string
  name: string
  description?: string | null
  key_prefix: string
  is_active: boolean
  last_used_at: string | null
  call_count: number
  created_at: string
}

interface Webhook {
  webhook_id: string
  url: string
  events: string[]
  is_active: boolean
  created_at: string
  description?: string | null
}

interface Stats {
  activeKeys: number
  requestsLast30d: number
  activeWebhooks: number
  avgResponseMs: number | null
}

interface UsagePoint {
  name: string
  다운로드: number
}

const ALL_EVENTS = [
  'dataset.created',
  'dataset.updated',
  'dataset.approved',
  'dataset.rejected',
]

const ENDPOINTS = [
  {
    method: 'GET',
    path: '/api/v1/datasets',
    desc: '개방 데이터셋 목록 조회 (페이지네이션 지원)',
    params: 'page, per_page(최대 100)',
  },
  {
    method: 'GET',
    path: '/api/v1/datasets/{id}',
    desc: '데이터셋 메타데이터 조회',
    params: '',
  },
  {
    method: 'GET',
    path: '/api/v1/datasets/{id}/data',
    desc: '데이터셋 다운로드 (CSV / JSON)',
    params: 'format=csv|json, limit(최대 10000), offset',
  },
  {
    method: 'GET',
    path: '/api/dcat',
    desc: 'DCAT 3.0 LD+JSON 카탈로그 (인증 불필요)',
    params: '',
  },
]

const API_BASE = typeof window !== 'undefined' ? window.location.origin : ''

const CURL_EXAMPLE = `# 헤더 방식 (권장)
curl -H "x-api-key: eum_xxxxxx" \\
  ${API_BASE}/api/v1/datasets

# CSV 다운로드
curl -H "x-api-key: eum_xxxxxx" \\
  "${API_BASE}/api/v1/datasets/youth_pop/data?format=csv" \\
  -o youth_pop.csv`

export default function OpenApiClient() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [usage, setUsage] = useState<{ topDownloads: { datasetId: string; title: string; count: number }[] } | null>(null)
  const [tab, setTab] = useState<'keys' | 'webhooks' | 'docs'>('keys')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  // 검색
  const [keyQuery, setKeyQuery] = useState('')
  const [whQuery, setWhQuery] = useState('')

  // API 키 발급 폼
  const [newPlain, setNewPlain] = useState<string | null>(null)
  const [showKeyForm, setShowKeyForm] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [keyDesc, setKeyDesc] = useState('')
  const [keyCreating, setKeyCreating] = useState(false)

  // 웹훅 등록 폼
  const [showWHForm, setShowWHForm] = useState(false)
  const [whUrl, setWhUrl] = useState('')
  const [whDesc, setWhDesc] = useState('')
  const [whSecret, setWhSecret] = useState('')
  const [whEvents, setWhEvents] = useState<string[]>([])
  const [whCreating, setWhCreating] = useState(false)

  // 목록 액션 로딩
  const [togglingKeyId, setTogglingKeyId] = useState<string | null>(null)
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null)
  const [rotatingKeyId, setRotatingKeyId] = useState<string | null>(null)

  const [copiedCurl, setCopiedCurl] = useState(false)

  const loadAll = async () => {
    setError(null)
    try {
      const [k, w, s, u] = await Promise.all([
        fetch('/api/openapi/keys').then(r => r.json()),
        fetch('/api/openapi/webhooks').then(r => r.json()),
        fetch('/api/openapi/stats').then(r => r.json()),
        fetch('/api/usage?period=month').then(r => r.json()),
      ])
      setKeys(Array.isArray(k) ? k : [])
      setWebhooks(Array.isArray(w) ? w : [])
      setStats(s && typeof s === 'object' && !('error' in s) ? s : null)
      setUsage(u && typeof u === 'object' && !('error' in u) ? u : null)
    } catch (e) {
      setError('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
      setRetrying(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const handleRetry = () => {
    setRetrying(true)
    setLoading(true)
    loadAll()
  }

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyName.trim()) return
    setKeyCreating(true)
    const r = await fetch('/api/openapi/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: keyName.trim(), description: keyDesc.trim() || undefined }),
    })
    const d = await r.json()
    if (r.ok) {
      setNewPlain(d.key)
      setShowKeyForm(false)
      setKeyName('')
      setKeyDesc('')
      toast.success('API 키가 발급되었습니다. 즉시 복사하여 보관하세요.')
      fetch('/api/openapi/keys').then(r2 => r2.json()).then(k => setKeys(Array.isArray(k) ? k : []))
      fetch('/api/openapi/stats').then(r2 => r2.json()).then(s => {
        if (s && !s.error) setStats(s)
      })
    }
    setKeyCreating(false)
  }

  const rotateKey = async (key: ApiKey) => {
    if (!confirm(`"${key.name}" 키를 재발급하시겠습니까? 기존 키는 즉시 폐기됩니다.`)) return
    setRotatingKeyId(key.key_id)
    await deleteKeyInternal(key.key_id, false)
    const r = await fetch('/api/openapi/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `${key.name} (재발급)`, description: key.description ?? undefined }),
    })
    const d = await r.json()
    if (r.ok) {
      setNewPlain(d.key)
      toast.success('API 키가 재발급되었습니다. 즉시 복사하여 보관하세요.')
      await loadAll()
    }
    setRotatingKeyId(null)
  }

  const toggleKey = async (keyId: string, current: boolean) => {
    setTogglingKeyId(keyId)
    await fetch(`/api/openapi/keys/${keyId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    })
    fetch('/api/openapi/keys').then(r => r.json()).then(k => setKeys(Array.isArray(k) ? k : [])).finally(() => setTogglingKeyId(null))
  }

  const deleteKeyInternal = async (keyId: string, notify = true) => {
    await fetch(`/api/openapi/keys/${keyId}`, { method: 'DELETE' })
    if (notify) toast('API 키가 삭제되었습니다.')
    fetch('/api/openapi/keys').then(r => r.json()).then(k => setKeys(Array.isArray(k) ? k : []))
    fetch('/api/openapi/stats').then(r => r.json()).then(s => { if (s && !s.error) setStats(s) })
  }

  const deleteKey = async (keyId: string) => {
    if (!confirm('API 키를 삭제하시겠습니까?')) return
    setDeletingKeyId(keyId)
    await deleteKeyInternal(keyId)
    setDeletingKeyId(null)
  }

  const createWebhook = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!whUrl.trim() || !whEvents.length) return
    setWhCreating(true)
    const r = await fetch('/api/openapi/webhooks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: whUrl.trim(),
        events: whEvents,
        description: whDesc.trim() || undefined,
        secret: whSecret.trim() || undefined,
      }),
    })
    if (r.ok) {
      setShowWHForm(false)
      setWhUrl('')
      setWhDesc('')
      setWhSecret('')
      setWhEvents([])
      toast.success('웹훅이 등록되었습니다.')
      fetch('/api/openapi/webhooks').then(r2 => r2.json()).then(w => setWebhooks(Array.isArray(w) ? w : []))
      fetch('/api/openapi/stats').then(r2 => r2.json()).then(s => { if (s && !s.error) setStats(s) })
    }
    setWhCreating(false)
  }

  const toggleEvent = (ev: string) =>
    setWhEvents(prev =>
      prev.includes(ev) ? prev.filter(x => x !== ev) : [...prev, ev]
    )

  const filteredKeys = useMemo(() => {
    const q = keyQuery.trim().toLowerCase()
    if (!q) return keys
    return keys.filter(k =>
      k.name.toLowerCase().includes(q) ||
      (k.description?.toLowerCase().includes(q) ?? false) ||
      k.key_prefix.toLowerCase().includes(q)
    )
  }, [keys, keyQuery])

  const filteredWebhooks = useMemo(() => {
    const q = whQuery.trim().toLowerCase()
    if (!q) return webhooks
    return webhooks.filter(w =>
      w.url.toLowerCase().includes(q) ||
      (w.description?.toLowerCase().includes(q) ?? false) ||
      w.events.some(ev => ev.toLowerCase().includes(q))
    )
  }, [webhooks, whQuery])

  const usageChartData: UsagePoint[] = useMemo(() => {
    if (!usage?.topDownloads?.length) return []
    return usage.topDownloads.map(u => ({
      name: u.title.length > 10 ? u.title.slice(0, 10) + '…' : u.title,
      다운로드: u.count,
    }))
  }, [usage])

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(CURL_EXAMPLE)
    setCopiedCurl(true)
    toast.success('코드를 복사했습니다')
    setTimeout(() => setCopiedCurl(false), 2000)
  }

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="flex gap-1 border-b pb-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-b-none" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} padding="md">
          <div className="flex justify-between">
            <div className="space-y-2 w-full">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        </Card>
      ))}
    </div>
  )

  if (error) return (
    <div className="space-y-6">
      <PageHeader title="개방 API 관리" subtitle="공공데이터 외부 연계 API 키 발급 및 웹훅 설정" />
      <Card className="text-center py-16">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-7 h-7 text-red-500" />
        </div>
        <h3 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1">데이터 로딩 실패</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-xs mx-auto">{error}</p>
        <Btn onClick={handleRetry} loading={retrying}>다시 시도</Btn>
      </Card>
    </div>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="개방 API 관리"
        subtitle="공공데이터 외부 연계 API 키 발급 및 웹훅 설정"
      />

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="활성 API 키" value={stats.activeKeys} color="blue" icon={<KeyRound className="w-5 h-5 text-blue-500" />} />
          <StatCard label="30일 요청 수" value={stats.requestsLast30d.toLocaleString()} color="green" icon={<BarChart3 className="w-5 h-5 text-green-500" />} />
          <StatCard label="활성 웹훅" value={stats.activeWebhooks} color="purple" icon={<Bell className="w-5 h-5 text-purple-500" />} />
          <StatCard label="평균 응답(ms)" value={stats.avgResponseMs != null ? stats.avgResponseMs : '—'} color="amber" icon={<Terminal className="w-5 h-5 text-amber-500" />} />
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-1 border-b dark:border-gray-700">
        {(['keys', 'webhooks', 'docs'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t === 'keys' ? 'API 키' : t === 'webhooks' ? '웹훅' : 'API 문서'}
          </button>
        ))}
      </div>

      {/* API 키 탭 */}
      {tab === 'keys' && (
        <div className="space-y-4">
          {/* 발급 직후 평문 키 표시 */}
          {newPlain && (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-2xl p-4">
              <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">
                API 키가 발급되었습니다. 지금 복사하세요 — 다시 확인할 수 없습니다.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 text-xs bg-white dark:bg-gray-900 border rounded-lg px-3 py-2 font-mono text-green-900 break-all">
                  {newPlain}
                </code>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(newPlain)
                    toast.success('API 키를 복사했습니다')
                  }}
                  className="text-green-700 dark:text-green-300 border-green-300 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40"
                >
                  <Copy className="w-3.5 h-3.5" /> 복사
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => setNewPlain(null)}>닫기</Btn>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
              <input
                value={keyQuery}
                onChange={e => setKeyQuery(e.target.value)}
                placeholder="키 이름, 설명, 접두사 검색"
                className="w-full border rounded-lg pl-9 pr-8 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
              {keyQuery && (
                <button
                  onClick={() => setKeyQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Btn onClick={() => setShowKeyForm(v => !v)}>
              + API 키 발급
            </Btn>
          </div>

          {showKeyForm && (
            <Card>
              <form onSubmit={createKey} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="apikey-name" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">키 이름 *</label>
                    <input
                      id="apikey-name"
                      value={keyName}
                      onChange={e => setKeyName(e.target.value)}
                      required
                      placeholder="예: 행정안전부 연계"
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="apikey-desc" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">설명 (선택)</label>
                    <input
                      id="apikey-desc"
                      value={keyDesc}
                      onChange={e => setKeyDesc(e.target.value)}
                      placeholder="용도 설명"
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn type="submit" loading={keyCreating} disabled={!keyName.trim()}>
                    발급
                  </Btn>
                  <Btn type="button" variant="secondary" onClick={() => setShowKeyForm(false)}>
                    취소
                  </Btn>
                </div>
              </form>
            </Card>
          )}

          <div className="space-y-2">
            {keys.length === 0 && (
              <EmptyState
                icon={<KeyRound className="w-7 h-7 text-amber-400" />}
                title="발급된 API 키가 없습니다"
                description="API 키를 발급하면 외부 시스템에서 데이터에 접근할 수 있습니다"
                action={{ label: 'API 키 발급하기', onClick: () => setShowKeyForm(true) }}
              />
            )}
            {keys.length > 0 && filteredKeys.length === 0 && (
              <Card className="text-center py-12">
                <p className="text-sm text-gray-500 dark:text-gray-400">검색 결과가 없습니다</p>
                <Btn variant="ghost" size="sm" className="mt-2" onClick={() => setKeyQuery('')}>검색 초기화</Btn>
              </Card>
            )}
            {filteredKeys.map(k => (
              <Card key={k.key_id} padding="md" hover>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 dark:text-gray-200">{k.name}</div>
                    {k.description && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{k.description}</div>
                    )}
                    <div className="text-xs text-gray-400 dark:text-gray-300 font-mono mt-0.5">
                      {k.key_prefix}••••••••
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-300 mt-0.5 flex flex-wrap gap-3">
                      <span>{k.last_used_at ? `마지막 사용: ${k.last_used_at.slice(0, 10)}` : '미사용'}</span>
                      <span>누적 호출: {k.call_count.toLocaleString()}회</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={k.is_active ? 'green' : 'gray'}>
                      {k.is_active ? '활성' : '비활성'}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t dark:border-gray-700">
                  <Btn
                    size="sm"
                    variant="secondary"
                    loading={togglingKeyId === k.key_id}
                    onClick={() => toggleKey(k.key_id, k.is_active)}
                  >
                    {k.is_active ? '비활성화' : '활성화'}
                  </Btn>
                  <Btn
                    size="sm"
                    variant="secondary"
                    loading={rotatingKeyId === k.key_id}
                    onClick={() => rotateKey(k)}
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    <RefreshCw className="w-3 h-3" /> 재발급
                  </Btn>
                  <Btn
                    size="sm"
                    variant="danger"
                    loading={deletingKeyId === k.key_id}
                    onClick={() => deleteKey(k.key_id)}
                    className="ml-auto"
                  >
                    <Trash2 className="w-3 h-3" /> 삭제
                  </Btn>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 웹훅 탭 */}
      {tab === 'webhooks' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
              <input
                value={whQuery}
                onChange={e => setWhQuery(e.target.value)}
                placeholder="URL, 설명, 이벤트 검색"
                className="w-full border rounded-lg pl-9 pr-8 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
              />
              {whQuery && (
                <button
                  onClick={() => setWhQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Btn onClick={() => setShowWHForm(v => !v)}>
              + 웹훅 추가
            </Btn>
          </div>

          {showWHForm && (
            <Card>
              <form onSubmit={createWebhook} className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="wh-url" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">URL *</label>
                    <input
                      id="wh-url"
                      value={whUrl}
                      onChange={e => setWhUrl(e.target.value)}
                      required
                      type="url"
                      placeholder="https://your-server.com/webhook"
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="wh-desc" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">설명 (선택)</label>
                    <input
                      id="wh-desc"
                      value={whDesc}
                      onChange={e => setWhDesc(e.target.value)}
                      placeholder="웹훅 용도"
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="wh-secret" className="block text-xs text-gray-500 dark:text-gray-400 mb-1">시크릿 키 (선택, 서명 검증용)</label>
                  <input
                    id="wh-secret"
                    value={whSecret}
                    onChange={e => setWhSecret(e.target.value)}
                    placeholder="whsec_xxxxxxxx"
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 dark:placeholder-gray-500"
                  />
                </div>
                <div>
                  <p className="block text-xs text-gray-500 dark:text-gray-400 mb-1">수신할 이벤트 *</p>
                  <div className="flex flex-wrap gap-3">
                    {ALL_EVENTS.map(ev => (
                      <label key={ev} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={whEvents.includes(ev)}
                          onChange={() => toggleEvent(ev)}
                        />
                        <code>{ev}</code>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn type="submit" loading={whCreating} disabled={!whUrl.trim() || !whEvents.length}>
                    등록
                  </Btn>
                  <Btn type="button" variant="secondary" onClick={() => setShowWHForm(false)}>
                    취소
                  </Btn>
                </div>
              </form>
            </Card>
          )}

          <div className="space-y-2">
            {webhooks.length === 0 && (
              <EmptyState
                icon={<Bell className="w-7 h-7 text-blue-400" />}
                title="등록된 웹훅이 없습니다"
                description="데이터셋 이벤트 발생 시 지정한 URL로 실시간 알림을 별냅니다"
                action={{ label: '웹훅 등록하기', onClick: () => setShowWHForm(true) }}
              />
            )}
            {webhooks.length > 0 && filteredWebhooks.length === 0 && (
              <Card className="text-center py-12">
                <p className="text-sm text-gray-500 dark:text-gray-400">검색 결과가 없습니다</p>
                <Btn variant="ghost" size="sm" className="mt-2" onClick={() => setWhQuery('')}>검색 초기화</Btn>
              </Card>
            )}
            {filteredWebhooks.map(w => (
              <Card key={w.webhook_id} padding="md" hover className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-700 dark:text-gray-300 break-all">{w.url}</div>
                  {w.description && <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{w.description}</div>}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {w.events.map(ev => (
                      <Badge key={ev} variant="purple" size="sm">{ev}</Badge>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-300 mt-1">
                    등록: {w.created_at.slice(0, 10)}
                  </div>
                </div>
                <span className="ml-4 shrink-0">
                  <Badge variant={w.is_active ? 'green' : 'gray'}>
                    {w.is_active ? '활성' : '비활성'}
                  </Badge>
                </span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* API 문서 탭 */}
      {tab === 'docs' && (
        <Card padding="lg">
          <div className="space-y-6">
            {/* 사용량 차트 */}
            <div>
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> 엔드포인트별 사용량 (최근 30일)
              </h3>
              {usageChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={usageChartData} margin={{ top: 4, right: 16, left: 0, bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="다운로드" fill="#1457b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-gray-400 dark:text-gray-300 text-sm">최근 30일간 사용량 데이터가 없습니다.</div>
              )}
            </div>

            <div>
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-3">공개 API 엔드포인트</h3>
              <div className="space-y-4">
                {ENDPOINTS.map(ep => (
                  <div key={ep.path} className="flex gap-3 items-start">
                    <Badge variant="green" size="sm">{ep.method}</Badge>
                    <div>
                      <code className="text-xs font-mono text-gray-800 dark:text-gray-200">{ep.path}</code>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ep.desc}</p>
                      {ep.params && (
                        <p className="text-xs text-gray-400 dark:text-gray-300 mt-0.5">파라미터: {ep.params}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">인증 방법</h3>
                <Btn size="sm" variant="secondary" onClick={handleCopyCurl}>
                  {copiedCurl ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedCurl ? '복사됨' : '복사'}
                </Btn>
              </div>
              <div className="bg-gray-50 dark:bg-gray-950 rounded-2xl p-4 space-y-2">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  헤더 또는 쿼리 파라미터로 API 키를 전달합니다.
                </p>
                <pre className="text-xs font-mono bg-gray-900 text-green-300 rounded-xl p-3 overflow-x-auto">
                  {CURL_EXAMPLE}
                </pre>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">웹훅 이벤트</h3>
              <div className="space-y-1">
                {ALL_EVENTS.map(ev => (
                  <div key={ev} className="flex items-center gap-2 text-xs">
                    <Badge variant="purple" size="sm">{ev}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
