'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart2, FlaskConical, Target, Plus, Trash2, Save,
  CheckCircle, AlertTriangle, Clock, ExternalLink, FileText,
  Layers, Search, X,
} from 'lucide-react'
import PipelineFlow from './PipelineFlow'
import PageHeader from '@/components/ui/PageHeader'
import Card from '@/components/ui/Card'
import StatCard from '@/components/ui/StatCard'
import Badge from '@/components/ui/Badge'
import Btn from '@/components/ui/Btn'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'

// ────── 타입 ──────
interface AnalysisRecord {
  record_id: string; tenant_id: string; title: string
  purpose: string | null; datasets_used: string[] | null
  result_summary: string | null; policy_applied: boolean
  performed_at: string; created_at: string
}
interface SyntheticCase {
  case_id: string; tenant_id: string
  case_type: 'synthetic' | 'anonymized'
  title: string; dataset_id: string | null; portal_url: string | null
  opened_at: string; created_at: string
}
interface Targets {
  target_year: number; open_rate_goal: number; ai_ready_goal: number
  quality_pass_goal: number; synthetic_goal: number; analysis_goal: number
}

type PerformanceTab = 'analysis' | 'synthetic' | 'targets' | 'qualitative'
type MainTab = 'flow' | 'performance'

interface QualInput {
  key: string; name: string
  status: 'ok' | 'warn' | 'na'
  note: string | null
  updated_at: string | null
}

// ────── 공통 스켈레톤 ──────
function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} padding="sm" className="flex items-start gap-3">
          <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2 py-0.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </Card>
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={<AlertTriangle className="w-6 h-6 text-red-500" />}
        title="데이터를 불러오지 못했습니다"
        description={message}
        action={{ label: '다시 시도', onClick: onRetry }}
      />
    </Card>
  )
}

// ────── 서브컴포넌트: 분석 실적 ──────
function AnalysisTab() {
  const [records, setRecords] = useState<AnalysisRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({
    title: '', purpose: '', datasets_used: '', result_summary: '',
    policy_applied: false, performed_at: '',
  })

  const load = () => {
    setLoading(true)
    setError(null)
    fetch('/api/pipeline/analysis')
      .then(async r => {
        if (!r.ok) throw new Error('데이터를 불러오지 못했습니다.')
        return r.json()
      })
      .then(d => { setRecords(Array.isArray(d) ? d : []); setLoading(false) })
      .catch((e) => { setError((e as Error).message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return records
    return records.filter(r =>
      r.title.toLowerCase().includes(q) ||
      (r.purpose && r.purpose.toLowerCase().includes(q)) ||
      (r.result_summary && r.result_summary.toLowerCase().includes(q))
    )
  }, [records, query])

  const total = records.length
  const policyCount = records.filter(r => r.policy_applied).length

  const save = async () => {
    if (!form.title.trim() || !form.performed_at) return
    setSaving(true)
    const res = await fetch('/api/pipeline/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        purpose: form.purpose || undefined,
        datasets_used: form.datasets_used
          ? form.datasets_used.split(',').map(s => s.trim()).filter(Boolean)
          : [],
        result_summary: form.result_summary || undefined,
        policy_applied: form.policy_applied,
        performed_at: form.performed_at,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setForm({ title: '', purpose: '', datasets_used: '', result_summary: '', policy_applied: false, performed_at: '' })
      setShowForm(false)
      load()
    }
  }

  const del = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    setDeleting(id)
    await fetch(`/api/pipeline/analysis/${id}`, { method: 'DELETE' })
    setDeleting(null)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">데이터 분석·활용 실적</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            평가편람 분석·활용 ①-1 지표 — 데이터 분석·정책활용 실적 (10점)
          </p>
        </div>
        <Btn
          size="sm"
          className="bg-purple-600 hover:bg-purple-700 border-purple-600"
          onClick={() => setShowForm(v => !v)}
        >
          <Plus className="w-3.5 h-3.5" />
          실적 등록
        </Btn>
      </div>

      {!loading && !error && total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="총 실적" value={total} color="purple" icon={<BarChart2 className="w-5 h-5" />} />
          <StatCard label="정책 반영" value={policyCount} color="green" icon={<CheckCircle className="w-5 h-5" />} />
          <StatCard label="미반영" value={total - policyCount} color="gray" icon={<Clock className="w-5 h-5" />} />
          <StatCard label="반영률" value={`${total ? Math.round(policyCount / total * 100) : 0}%`} color="purple" icon={<Target className="w-5 h-5" />} />
        </div>
      )}

      {showForm && (
        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-purple-800 dark:text-purple-300">분석 실적 신규 등록</h4>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pl-title" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">분석명 *</label>
              <Input
                id="pl-title"
                className="rounded-lg focus:ring-purple-300 py-2"
                placeholder="예: 경남 청년인구 이동패턴 분석"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="pl-performed-at" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">수행일 *</label>
              <Input
                id="pl-performed-at"
                type="date"
                className="rounded-lg focus:ring-purple-300 py-2"
                value={form.performed_at}
                onChange={e => setForm(p => ({ ...p, performed_at: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="pl-purpose" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">분석 목적</label>
              <Input
                id="pl-purpose"
                className="rounded-lg focus:ring-purple-300 py-2"
                placeholder="정책활용 / 서비스개선 / 사회문제해결"
                value={form.purpose}
                onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="pl-datasets" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">활용 데이터셋 (쉼표 구분)</label>
              <Input
                id="pl-datasets"
                className="rounded-lg focus:ring-purple-300 py-2"
                placeholder="주민등록인구통계, 청년지원사업현황"
                value={form.datasets_used}
                onChange={e => setForm(p => ({ ...p, datasets_used: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="pl-result-summary" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">결과 요약</label>
              <Textarea
                id="pl-result-summary"
                className="rounded-lg focus:ring-purple-300 resize-none py-2"
                rows={2}
                placeholder="분석 결과 및 정책 제언 요약"
                value={form.result_summary}
                onChange={e => setForm(p => ({ ...p, result_summary: e.target.value }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 rounded accent-purple-600"
              checked={form.policy_applied}
              onChange={e => setForm(p => ({ ...p, policy_applied: e.target.checked }))}
            />
            <span className="text-gray-700 dark:text-gray-300">정책에 실제 반영됨</span>
          </label>
          <div className="flex gap-2 justify-end">
            <Btn size="sm" variant="ghost" onClick={() => setShowForm(false)}>취소</Btn>
            <Btn
              size="sm"
              className="bg-purple-600 hover:bg-purple-700 border-purple-600"
              loading={saving}
              disabled={!form.title.trim() || !form.performed_at}
              onClick={save}
            >
              <Save className="w-3.5 h-3.5" />
              저장
            </Btn>
          </div>
        </div>
      )}

      {!loading && !error && total > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
          <Input
            type="text"
            placeholder="분석명, 목적, 결과 요약 검색..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9 pr-9 py-2 rounded-lg focus:ring-purple-300"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400"
              aria-label="검색어 초기화"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : records.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BarChart2 className="w-6 h-6 text-purple-500" />}
            title="등록된 분석 실적이 없습니다"
            description="분석·활용 지표 기여를 위해 실적을 등록하세요."
            action={{ label: '실적 등록', onClick: () => setShowForm(true) }}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
            title="검색 결과가 없습니다"
            description="다른 키워드나 필터를 변경해 보세요."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => (
            <Card key={r.record_id} padding="sm" hover className="flex items-start gap-3">
              <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${r.policy_applied ? 'bg-green-100' : 'bg-gray-100 dark:bg-gray-800'}`}>
                {r.policy_applied
                  ? <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                  : <Clock className="w-4 h-4 text-gray-400 dark:text-gray-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{r.title}</p>
                  <Btn
                    size="sm"
                    variant="ghost"
                    className="text-gray-300 dark:text-gray-200 hover:text-red-600 hover:bg-red-50"
                    loading={deleting === r.record_id}
                    onClick={() => del(r.record_id)}
                    aria-label="삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Btn>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400 dark:text-gray-300">{r.performed_at.slice(0, 10)}</span>
                  {r.purpose && <Badge variant="purple">{r.purpose}</Badge>}
                  <Badge variant={r.policy_applied ? 'green' : 'gray'}>
                    {r.policy_applied ? '정책 반영' : '미반영'}
                  </Badge>
                </div>
                {r.datasets_used && r.datasets_used.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {r.datasets_used.map(ds => (
                      <Badge key={ds} variant="gray" size="sm">{ds}</Badge>
                    ))}
                  </div>
                )}
                {r.result_summary && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{r.result_summary}</p>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ────── 서브컴포넌트: 가명·합성 실적 ──────
const CASE_TYPE_LABEL = { synthetic: '합성데이터', anonymized: '가명정보 제공' }
const CASE_TYPE_BADGE: Record<string, 'blue' | 'amber'> = { synthetic: 'blue', anonymized: 'amber' }

function SyntheticTab() {
  const [cases, setCases] = useState<SyntheticCase[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'synthetic' | 'anonymized'>('all')
  const [form, setForm] = useState({
    case_type: 'synthetic' as 'synthetic' | 'anonymized',
    title: '', dataset_id: '', portal_url: '', opened_at: '',
  })

  const load = () => {
    setLoading(true)
    setError(null)
    fetch('/api/pipeline/synthetic')
      .then(async r => {
        if (!r.ok) throw new Error('데이터를 불러오지 못했습니다.')
        return r.json()
      })
      .then(d => { setCases(Array.isArray(d) ? d : []); setLoading(false) })
      .catch((e) => { setError((e as Error).message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return cases.filter(c => {
      const matchesType = typeFilter === 'all' || c.case_type === typeFilter
      const matchesQuery = !q ||
        c.title.toLowerCase().includes(q) ||
        (c.dataset_id && c.dataset_id.toLowerCase().includes(q))
      return matchesType && matchesQuery
    })
  }, [cases, query, typeFilter])

  const bonusScore = Math.min(cases.length, 5)
  const syntheticCount = cases.filter(c => c.case_type === 'synthetic').length
  const anonymizedCount = cases.filter(c => c.case_type === 'anonymized').length

  const save = async () => {
    if (!form.title.trim() || !form.opened_at) return
    setSaving(true)
    const res = await fetch('/api/pipeline/synthetic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        case_type: form.case_type,
        title: form.title,
        dataset_id: form.dataset_id || undefined,
        portal_url: form.portal_url || undefined,
        opened_at: form.opened_at,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setForm({ case_type: 'synthetic', title: '', dataset_id: '', portal_url: '', opened_at: '' })
      setShowForm(false)
      load()
    }
  }

  const del = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return
    setDeleting(id)
    await fetch(`/api/pipeline/synthetic/${id}`, { method: 'DELETE' })
    setDeleting(null)
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">가명정보·합성데이터 개방 실적</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            평가편람 ⑤ 가점 — 1건당 1점, 최대 5점 가점
          </p>
        </div>
        <Btn
          size="sm"
          className="bg-blue-600 hover:bg-blue-700 border-blue-600"
          onClick={() => setShowForm(v => !v)}
        >
          <Plus className="w-3.5 h-3.5" />
          실적 등록
        </Btn>
      </div>

      {!loading && !error && cases.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="총 실적" value={cases.length} color="blue" icon={<FlaskConical className="w-5 h-5" />} />
          <StatCard label="획득 가점" value={`+${bonusScore}`} color="green" icon={<CheckCircle className="w-5 h-5" />} />
          <StatCard label="합성데이터" value={syntheticCount} color="blue" icon={<BarChart2 className="w-5 h-5" />} />
          <StatCard label="가명정보 제공" value={anonymizedCount} color="amber" icon={<FileText className="w-5 h-5" />} />
        </div>
      )}

      {/* 가점 현황 배지 */}
      {!loading && !error && (
        <div className={`rounded-xl p-4 flex items-center gap-4 ${bonusScore >= 5 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'}`}>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold ${bonusScore >= 5 ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'}`}>
            +{bonusScore}
          </div>
          <div>
            <p className={`text-sm font-semibold ${bonusScore >= 5 ? 'text-green-700 dark:text-green-400' : 'text-blue-700 dark:text-blue-400'}`}>
              현재 가점 {bonusScore}점 / 최대 5점
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {cases.length}건 등록 — {bonusScore >= 5 ? '최대 가점 달성!' : `${5 - bonusScore}건 추가 시 만점`}
            </p>
          </div>
          <div className="flex-1">
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${bonusScore >= 5 ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${(bonusScore / 5) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-300">가명정보·합성데이터 실적 등록</h4>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pl-case-type" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">유형 *</label>
              <Select
                id="pl-case-type"
                className="rounded-lg focus:ring-blue-300 py-2"
                value={form.case_type}
                onChange={e => setForm(p => ({ ...p, case_type: e.target.value as 'synthetic' | 'anonymized' }))}
              >
                <option value="synthetic">합성데이터 개방</option>
                <option value="anonymized">가명정보 제공</option>
              </Select>
            </div>
            <div>
              <label htmlFor="pl-opened-at" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">개방·제공일 *</label>
              <Input
                id="pl-opened-at"
                type="date"
                className="rounded-lg focus:ring-blue-300 py-2"
                value={form.opened_at}
                onChange={e => setForm(p => ({ ...p, opened_at: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="pl-syn-title" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">데이터명 *</label>
              <Input
                id="pl-syn-title"
                className="rounded-lg focus:ring-blue-300 py-2"
                placeholder="예: 경남 복지서비스 이용 합성데이터"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="pl-dataset-id" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">연관 데이터셋 ID</label>
              <Input
                id="pl-dataset-id"
                className="rounded-lg focus:ring-blue-300 py-2"
                placeholder="catalog 데이터셋 ID"
                value={form.dataset_id}
                onChange={e => setForm(p => ({ ...p, dataset_id: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="pl-portal-url" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">공공데이터포털 URL</label>
              <Input
                id="pl-portal-url"
                type="url"
                className="rounded-lg focus:ring-blue-300 py-2"
                placeholder="https://data.go.kr/..."
                value={form.portal_url}
                onChange={e => setForm(p => ({ ...p, portal_url: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Btn size="sm" variant="ghost" onClick={() => setShowForm(false)}>취소</Btn>
            <Btn
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 border-blue-600"
              loading={saving}
              disabled={!form.title.trim() || !form.opened_at}
              onClick={save}
            >
              <Save className="w-3.5 h-3.5" />
              저장
            </Btn>
          </div>
        </div>
      )}

      {!loading && !error && cases.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
            <Input
              type="text"
              placeholder="데이터명, 데이터셋 ID 검색..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9 pr-9 py-2 rounded-lg focus:ring-blue-300"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-300 hover:text-gray-600 dark:hover:text-gray-400"
                aria-label="검색어 초기화"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            {(['all', 'synthetic', 'anonymized'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  typeFilter === t
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-950'
                }`}
              >
                {t === 'all' ? '전체' : CASE_TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <ListSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : cases.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FlaskConical className="w-6 h-6 text-blue-500" />}
            title="등록된 실적이 없습니다"
            description="1건 등록 시 1점 가점 부여됩니다."
            action={{ label: '실적 등록', onClick: () => setShowForm(true) }}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
            title="검색 결과가 없습니다"
            description="다른 키워드나 필터를 변경해 보세요."
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <Card key={c.case_id} padding="sm" hover className="flex items-start gap-3">
              <div className="mt-0.5 w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                <FlaskConical className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{c.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant={CASE_TYPE_BADGE[c.case_type]}>{CASE_TYPE_LABEL[c.case_type]}</Badge>
                      <span className="text-xs text-gray-400 dark:text-gray-300">{c.opened_at.slice(0, 10)}</span>
                      {c.portal_url && (
                        <a
                          href={c.portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline flex items-center gap-0.5"
                        >
                          포털 <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <Btn
                    size="sm"
                    variant="ghost"
                    className="text-gray-300 dark:text-gray-200 hover:text-red-600 hover:bg-red-50"
                    loading={deleting === c.case_id}
                    onClick={() => del(c.case_id)}
                    aria-label="삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Btn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ────── 서브컴포넌트: 평가 목표 ──────
function TargetsTab() {
  const [targets, setTargets] = useState<Targets>({
    target_year: 2026, open_rate_goal: 80, ai_ready_goal: 50,
    quality_pass_goal: 100, synthetic_goal: 2, analysis_goal: 5,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = () => {
    setLoading(true)
    setError(null)
    fetch('/api/pipeline/targets')
      .then(async r => {
        if (!r.ok) throw new Error('목표 데이터를 불러오지 못했습니다.')
        return r.json()
      })
      .then(d => { setTargets(d); setLoading(false) })
      .catch((e) => { setError((e as Error).message); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    const res = await fetch('/api/pipeline/targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(targets),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  type NumField = keyof Omit<Targets, 'target_year'>

  const fields: { key: NumField; label: string; unit: string; desc: string }[] = [
    { key: 'open_rate_goal',      label: '개방 목표율',        unit: '%',  desc: '개방계획 이행률 목표 (편람 ①-1)' },
    { key: 'ai_ready_goal',       label: 'AI-Ready 목표율',    unit: '%',  desc: 'AI친화 데이터 비율 목표 (편람 ②)' },
    { key: 'quality_pass_goal',   label: '품질진단 통과 목표', unit: '%',  desc: '품질진단 통과율 목표 (편람 ②)' },
    { key: 'synthetic_goal',      label: '가명·합성 목표건수', unit: '건', desc: '가점 목표 (최대 5건 = 5점)' },
    { key: 'analysis_goal',       label: '분석 실적 목표건수', unit: '건', desc: '분석·활용 ①-1 지표 목표' },
  ]

  if (loading) {
    return (
      <Card padding="sm">
        <Skeleton className="h-4 w-1/3 mb-4" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </Card>
    )
  }

  if (error) return <ErrorState message={error} onRetry={load} />

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">평가 목표 설정</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">목표 대비 현황을 리포트에서 비교합니다.</p>
      </div>
      <div className="bg-white dark:bg-gray-900 border rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-b flex items-center gap-2">
          <Target className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{targets.target_year}년 평가 목표</span>
        </div>
        <div className="p-4 space-y-4">
          {fields.map(f => (
            <div key={f.key} className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{f.label}</p>
                <p className="text-xs text-gray-400 dark:text-gray-300">{f.desc}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Input
                  type="number"
                  min={0}
                  max={f.unit === '%' ? 100 : 100}
                  step={f.unit === '%' ? 5 : 1}
                  className="w-20 py-1.5 text-right rounded-lg focus:ring-amber-300"
                  value={targets[f.key]}
                  onChange={e => setTargets(p => ({ ...p, [f.key]: Number(e.target.value) }))}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400 w-4">{f.unit}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-3 border-t bg-gray-50 dark:bg-gray-950 flex justify-end">
          <Btn
            size="sm"
            className={saved
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40'
              : 'bg-amber-500 hover:bg-amber-600 border-amber-500'}
            loading={saving}
            onClick={save}
          >
            {saved ? (
              <><CheckCircle className="w-3.5 h-3.5" /> 저장됨</>
            ) : (
              <><Save className="w-3.5 h-3.5" /> 목표 저장</>
            )}
          </Btn>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-700 dark:text-amber-300 space-y-1">
            <p className="font-medium">목표 설정 안내</p>
            <p>편람 기준: 개방율 80% 이상, AI-Ready 50% 이상, 품질진단 통과율 100%, 가명·합성 2건 이상.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ────── 서브컴포넌트: 정성지표 입력 ──────
const STATUS_LABEL: Record<string, string> = { ok: '우수', warn: '보통', na: '미입력' }
const STATUS_BADGE: Record<string, 'green' | 'amber' | 'gray'> = { ok: 'green', warn: 'amber', na: 'gray' }

function QualitativeTab() {
  const [inputs, setInputs] = useState<QualInput[] | null>(null)
  const [errMsg, setErrMsg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ status: 'ok' | 'warn' | 'na'; note: string }>({ status: 'na', note: '' })

  useEffect(() => {
    fetch('/api/evaluation/qualitative')
      .then(async r => {
        if (r.status === 400) { setErrMsg('no_tenant'); setLoading(false); return null }
        if (!r.ok) { setErrMsg('server_error'); setLoading(false); return null }
        return r.json()
      })
      .then((d: QualInput[] | null) => { if (d) { setInputs(Array.isArray(d) ? d : []); setLoading(false) } })
      .catch(() => { setErrMsg('server_error'); setLoading(false) })
  }, [])

  function startEdit(inp: QualInput) {
    setEditing(inp.key)
    setDraft({ status: inp.status, note: inp.note ?? '' })
  }

  async function saveEdit(key: string) {
    setSaving(key)
    const res = await fetch('/api/evaluation/qualitative', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, status: draft.status, note: draft.note || undefined }),
    })
    setSaving(null)
    if (res.ok) {
      setInputs(prev => (prev ?? []).map(i =>
        i.key === key ? { ...i, status: draft.status, note: draft.note || null, updated_at: new Date().toISOString() } : i
      ))
      setEditing(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} padding="sm">
            <Skeleton className="h-4 w-1/3 mb-3" />
            <Skeleton className="h-3 w-2/3" />
          </Card>
        ))}
      </div>
    )
  }
  if (errMsg === 'no_tenant') return (
    <Card>
      <EmptyState
        icon={<AlertTriangle className="w-6 h-6 text-amber-500" />}
        title="기관 담당자 전용 기능입니다"
        description="개별 기관 계정으로 로그인하면 정성지표 실적을 입력할 수 있습니다."
      />
    </Card>
  )
  if (errMsg === 'server_error') return (
    <Card>
      <EmptyState
        icon={<AlertTriangle className="w-6 h-6 text-amber-500" />}
        title="데이터베이스 준비 중입니다"
        description="Supabase SQL Editor에서 017_qualitative_inputs.sql 마이그레이션을 적용해주세요."
      />
    </Card>
  )

  const safeInputs = inputs ?? []
  const naCount = safeInputs.filter(i => i.status === 'na').length

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">정성지표 실적 입력</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          자동 집계가 불가한 정성 지표는 담당자가 직접 실적을 입력합니다.
        </p>
      </div>

      {naCount > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{naCount}개 지표가 아직 입력되지 않았습니다. 실적을 입력하면 평가 점수에 반영됩니다.</span>
        </div>
      )}

      <div className="space-y-2">
        {safeInputs.map(inp => (
          <Card key={inp.key} padding="sm" hover>
            {editing === inp.key ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{inp.name}</p>
                <div className="flex gap-2">
                  {(['ok', 'warn', 'na'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setDraft(p => ({ ...p, status: s }))}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                        draft.status === s
                          ? STATUS_BADGE[s] === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' :
                            STATUS_BADGE[s] === 'amber' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' :
                            'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-950'
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
                <Textarea
                  className="rounded-lg focus:ring-indigo-300 resize-none py-2"
                  rows={3}
                  placeholder="실적 내용, 증빙 자료, 이행 현황 등을 간략히 기재하세요"
                  value={draft.note}
                  onChange={e => setDraft(p => ({ ...p, note: e.target.value }))}
                />
                <div className="flex gap-2 justify-end">
                  <Btn size="sm" variant="ghost" onClick={() => setEditing(null)}>취소</Btn>
                  <Btn
                    size="sm"
                    className="bg-indigo-600 hover:bg-indigo-700 border-indigo-600"
                    loading={saving === inp.key}
                    onClick={() => saveEdit(inp.key)}
                  >
                    <Save className="w-3 h-3" />
                    저장
                  </Btn>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={STATUS_BADGE[inp.status]}>{STATUS_LABEL[inp.status]}</Badge>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{inp.name}</p>
                  </div>
                  {inp.note && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{inp.note}</p>
                  )}
                  {inp.updated_at && (
                    <p className="text-xs text-gray-400 dark:text-gray-300 mt-1">
                      최종 수정: {new Date(inp.updated_at).toLocaleDateString('ko-KR')}
                    </p>
                  )}
                </div>
                <Btn
                  size="sm"
                  variant="secondary"
                  className="text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                  onClick={() => startEdit(inp)}
                >
                  입력
                </Btn>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

// ────── 메인 컴포넌트 ──────
const PERFORMANCE_TABS: { key: PerformanceTab; label: string; Icon: React.ElementType; color: string }[] = [
  { key: 'analysis',    label: '분석 실적',      Icon: BarChart2,    color: 'purple' },
  { key: 'synthetic',   label: '가명·합성 실적',  Icon: FlaskConical, color: 'blue' },
  { key: 'qualitative', label: '정성지표 입력',   Icon: FileText,     color: 'indigo' },
  { key: 'targets',     label: '평가 목표',      Icon: Target,       color: 'amber' },
]

const ACTIVE_STYLE: Record<string, string> = {
  purple: 'border-purple-500 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20',
  blue:   'border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20',
  indigo: 'border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20',
  amber:  'border-amber-500 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20',
}

export default function PipelineClient() {
  const [mainTab, setMainTab] = useState<MainTab>('flow')
  const [perfTab, setPerfTab] = useState<PerformanceTab>('analysis')

  return (
    <div className="space-y-6">
      <PageHeader
        title="데이터 파이프라인"
        subtitle="데이터가 수집·가공·분석·품질진단을 거쳐 개방되는 전체 흐름을 관리합니다."
      />

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {[
          { key: 'flow', label: '데이터 처리 흐름', Icon: Layers },
          { key: 'performance', label: '실적 관리', Icon: BarChart2 },
        ].map(({ key, label, Icon }) => {
          const active = mainTab === key
          return (
            <button
              key={key}
              onClick={() => setMainTab(key as MainTab)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px whitespace-nowrap ${
                active
                  ? 'border-blue-600 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-950'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          )
        })}
      </div>

      {mainTab === 'flow' && <PipelineFlow />}

      {mainTab === 'performance' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">평가편람 실적 관리</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              평가편람 정량 지표에 직접 기여하는 실적을 등록하고 관리합니다.
            </p>
          </div>

          <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            {PERFORMANCE_TABS.map(({ key, label, Icon, color }) => {
              const active = perfTab === key
              return (
                <button
                  key={key}
                  onClick={() => setPerfTab(key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px whitespace-nowrap ${
                    active ? ACTIVE_STYLE[color] : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-950'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              )
            })}
          </div>

          <div>
            {perfTab === 'analysis'    && <AnalysisTab />}
            {perfTab === 'synthetic'   && <SyntheticTab />}
            {perfTab === 'qualitative' && <QualitativeTab />}
            {perfTab === 'targets'     && <TargetsTab />}
          </div>
        </div>
      )}
    </div>
  )
}
