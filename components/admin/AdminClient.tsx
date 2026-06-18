'use client'

import { useState, useMemo } from 'react'
import {
  Search, Filter, CheckCircle, XCircle, Building2, Plus, Trash2,
  ChevronLeft, ChevronRight, RefreshCw, Users, ExternalLink,
  ShieldCheck, ScrollText, AlertCircle, Upload,
} from 'lucide-react'
import UserManagement from './UserManagement'
import AuditLogViewer from './AuditLogViewer'
import TenantStats from './TenantStats'
import PageHeader from '@/components/ui/PageHeader'
import Btn from '@/components/ui/Btn'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Card from '@/components/ui/Card'
import SortableTable from '@/components/common/SortableTable'

type TenantStatus = 'pending' | 'approved' | 'rejected'

interface Tenant {
  tenant_id: string
  name: string
  gov_type: string | null
  sgg_cd: string | null
  onboarded: boolean
  status?: TenantStatus
  reject_reason?: string | null
  notes?: string | null
  created_at?: string
}

interface Props { initialTenants: Tenant[] }

type Tab = 'tenants' | 'users' | 'audit'

const STATUS_LABEL: Record<TenantStatus, { label: string; variant: 'amber' | 'green' | 'red' }> = {
  pending:  { label: '승인 대기', variant: 'amber' },
  approved: { label: '승인 완료', variant: 'green' },
  rejected: { label: '반려',     variant: 'red' },
}

const GOV_TYPES = ['전체', '시청', '군청', '도청', '기타']

const PAGE_SIZE = 10

export default function AdminClient({ initialTenants }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('tenants')

  // 기관 관리 상태
  const [tenants, setTenants]         = useState<Tenant[]>(initialTenants)
  const [search, setSearch]           = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | TenantStatus>('all')
  const [govFilter, setGovFilter]     = useState('전체')
  const [page, setPage]               = useState(1)
  const [showForm, setShowForm]       = useState(false)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState('')
  const [listError, setListError]     = useState('')
  const [form, setForm]               = useState({ tenant_id: '', name: '', gov_type: '', sgg_cd: '' })
  const [actionId, setActionId]       = useState<string | null>(null)
  const [refreshing, setRefreshing]   = useState(false)
  const [bulkFile, setBulkFile]       = useState<File | null>(null)
  const [bulkType, setBulkType]       = useState<'users' | 'tenants'>('users')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult]   = useState<{ ok: number; fail: number; errors: string[] } | null>(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return tenants.filter(t => {
      const matchSearch = !term ||
        t.name.toLowerCase().includes(term) ||
        t.tenant_id.toLowerCase().includes(term) ||
        (t.sgg_cd ?? '').toLowerCase().includes(term)
      const matchStatus = statusFilter === 'all' || (t.status ?? 'pending') === statusFilter
      const matchGov    = govFilter === '전체' || t.gov_type === govFilter
      return matchSearch && matchStatus && matchGov
    })
  }, [tenants, search, statusFilter, govFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const statusCounts = useMemo(() => ({
    pending: tenants.filter(t => (t.status ?? 'pending') === 'pending').length,
    approved: tenants.filter(t => (t.status ?? 'pending') === 'approved').length,
    rejected: tenants.filter(t => (t.status ?? 'pending') === 'rejected').length,
  }), [tenants])

  async function reload() {
    setRefreshing(true)
    setListError('')
    try {
      const r = await fetch('/api/tenants')
      if (!r.ok) {
        setListError('기관 목록을 새로고침하지 못했습니다.')
        return
      }
      const d = await r.json()
      setTenants(Array.isArray(d) ? d : [])
    } catch {
      setListError('기관 목록을 새로고침하지 못했습니다.')
    } finally {
      setRefreshing(false)
    }
  }

  async function updateStatus(t: Tenant, status: TenantStatus, memo?: string) {
    setActionId(t.tenant_id)
    const payload: Record<string, unknown> = { status }
    if (status === 'rejected' && memo) payload.reject_reason = memo
    if (status === 'approved' && memo) payload.notes = memo
    const r = await fetch(`/api/tenants/${t.tenant_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setActionId(null)
    if (!r.ok) return
    setTenants(prev => prev.map(x => x.tenant_id === t.tenant_id ? {
      ...x,
      status,
      onboarded: status === 'approved',
      reject_reason: status === 'rejected' ? memo ?? x.reject_reason : x.reject_reason,
      notes: status === 'approved' ? memo ?? x.notes : x.notes,
    } : x))
  }

  async function toggleOnboarded(t: Tenant) {
    setActionId(t.tenant_id)
    const next = !t.onboarded
    const r = await fetch(`/api/tenants/${t.tenant_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarded: next }),
    })
    setActionId(null)
    if (!r.ok) return
    setTenants(prev => prev.map(x => x.tenant_id === t.tenant_id
      ? { ...x, onboarded: next, status: next ? 'approved' : (x.status === 'approved' ? 'pending' : x.status) }
      : x))
  }

  async function createTenant(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const payload = {
      tenant_id: form.tenant_id.trim(),
      name: form.name.trim(),
      gov_type: form.gov_type,
      sgg_cd: form.sgg_cd.trim(),
    }
    if (!payload.tenant_id || !payload.name) {
      setSaving(false)
      setError('기관 코드와 기관명을 입력해주세요.')
      return
    }
    const r = await fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const d = await r.json()
    setSaving(false)
    if (!r.ok) { setError(d.error ?? '오류가 발생했습니다'); return }
    setShowForm(false)
    setForm({ tenant_id: '', name: '', gov_type: '', sgg_cd: '' })
    await reload()
  }

  async function deleteTenant(id: string, name: string) {
    if (!confirm(`"${name}" 기관을 삭제하시겠습니까?`)) return
    setActionId(id)
    await fetch(`/api/tenants/${id}`, { method: 'DELETE' })
    setActionId(null)
    setTenants(prev => prev.filter(t => t.tenant_id !== id))
  }

  function resetFilters() {
    setSearch('')
    setStatusFilter('all')
    setGovFilter('전체')
    setPage(1)
  }

  function parseCsv(text: string): string[][] {
    const rows: string[][] = []
    let row: string[] = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      const next = text[i + 1]
      if (inQuotes) {
        if (ch === '"' && next === '"') { cell += '"'; i++ }
        else if (ch === '"') { inQuotes = false }
        else { cell += ch }
      } else {
        if (ch === '"') { inQuotes = true }
        else if (ch === ',') { row.push(cell); cell = '' }
        else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
        else if (ch !== '\r') { cell += ch }
      }
    }
    if (cell || row.length) { row.push(cell); rows.push(row) }
    return rows
  }

  async function runBulkUpload() {
    if (!bulkFile) return
    setBulkLoading(true)
    setBulkResult(null)
    const text = await bulkFile.text()
    const rows = parseCsv(text)
    const headers = rows[0]?.map(h => h.trim()) ?? []
    const dataRows = rows.slice(1).filter(r => r.some(c => c.trim()))

    let ok = 0
    let fail = 0
    const errors: string[] = []
    const endpoint = bulkType === 'users' ? '/api/admin/users' : '/api/tenants'

    for (let i = 0; i < dataRows.length; i++) {
      const values = dataRows[i]
      const record: Record<string, string | undefined> = {}
      headers.forEach((h, idx) => { record[h] = values[idx]?.trim() })
      const payload = bulkType === 'users'
        ? { email: record.email, password: record.password, role: record.role ?? 'viewer', tenant_id: record.tenant_id || null }
        : { tenant_id: record.tenant_id, name: record.name, gov_type: record.gov_type || undefined, sgg_cd: record.sgg_cd || undefined }

      try {
        const r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (r.ok) { ok++ }
        else {
          fail++
          const d = await r.json().catch(() => ({}))
          errors.push(`${i + 2}행: ${d.error ?? '실패'}`)
        }
      } catch (e) {
        fail++
        errors.push(`${i + 2}행: ${(e as Error).message}`)
      }
    }

    setBulkResult({ ok, fail, errors: errors.slice(0, 5) })
    setBulkLoading(false)
    if (bulkType === 'tenants') await reload()
  }

  const isFiltered = search || statusFilter !== 'all' || govFilter !== '전체'

  const tenantColumns: import('@/components/common/SortableTable').TableColumn<Tenant>[] = [
    {
      key: 'tenant_id',
      label: '기관 코드',
      sortable: true,
      sortValue: t => t.tenant_id,
      render: t => <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{t.tenant_id}</span>,
    },
    {
      key: 'name',
      label: '기관명',
      sortable: true,
      sortValue: t => t.name,
      render: t => <span className="font-medium text-gray-800 dark:text-gray-200">{t.name}</span>,
    },
    {
      key: 'gov_type',
      label: '유형',
      sortable: true,
      sortValue: t => t.gov_type ?? '',
      render: t => <span className="text-gray-500 dark:text-gray-400 text-xs">{t.gov_type ?? '—'}</span>,
    },
    {
      key: 'sgg_cd',
      label: '시군코드',
      sortable: true,
      sortValue: t => t.sgg_cd ?? '',
      render: t => <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{t.sgg_cd ?? '—'}</span>,
    },
    {
      key: 'status',
      label: '승인 상태',
      align: 'center',
      sortable: true,
      sortValue: t => t.status ?? 'pending',
      render: t => {
        const status = t.status ?? 'pending'
        return <Badge variant={STATUS_LABEL[status].variant} size="sm">{STATUS_LABEL[status].label}</Badge>
      },
    },
    {
      key: 'onboarded',
      label: '입주 여부',
      align: 'center',
      sortable: true,
      sortValue: t => (t.onboarded ? 1 : 0),
      render: t => {
        const isActing = actionId === t.tenant_id
        return (
          <Btn
            variant="ghost"
            size="sm"
            loading={isActing}
            disabled={isActing}
            onClick={() => toggleOnboarded(t)}
            className={t.onboarded ? '!text-green-700 hover:!bg-green-100' : '!text-gray-500 hover:!bg-gray-100'}
          >
            {isActing ? '처리 중...' : (t.onboarded ? '입주 중' : '미입주')}
          </Btn>
        )
      },
    },
    {
      key: 'memo',
      label: '메모 / 반려 사유',
      render: t => (
        <div className="text-xs text-gray-500 dark:text-gray-400 max-w-xs">
          {t.reject_reason ? (
            <span className="text-red-600 flex items-start gap-1">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              {t.reject_reason}
            </span>
          ) : t.notes ? (
            <span>{t.notes}</span>
          ) : (
            <span className="text-gray-300 dark:text-gray-200">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'portal',
      label: '포털',
      align: 'center',
      render: t => (
        <a
          href={`/portal?tenant_id=${encodeURIComponent(t.tenant_id)}`}
          className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
          title="해당 기관 데이터셋 보기"
        >
          <ExternalLink className="w-3 h-3" />
          보기
        </a>
      ),
    },
    {
      key: 'actions',
      label: '동작',
      align: 'center',
      render: t => {
        const status = t.status ?? 'pending'
        const isActing = actionId === t.tenant_id
        return (
          <div className="flex items-center justify-center gap-1">
            {status !== 'approved' && (
              <Btn
                variant="ghost"
                size="sm"
                loading={isActing}
                disabled={isActing}
                onClick={() => {
                  const memo = window.prompt('승인 메모를 입력하세요 (선택):')
                  if (memo === null) return
                  void updateStatus(t, 'approved', memo || undefined)
                }}
                className="!text-green-700 hover:!bg-green-50"
                title="승인"
              >
                <CheckCircle className="w-3 h-3" />
                승인
              </Btn>
            )}
            {status !== 'rejected' && (
              <Btn
                variant="ghost"
                size="sm"
                loading={isActing}
                disabled={isActing}
                onClick={() => {
                  const reason = window.prompt('반려 사유를 입력하세요 (필수):')
                  if (!reason) return
                  void updateStatus(t, 'rejected', reason)
                }}
                className="!text-red-700 hover:!bg-red-50"
                title="반려"
              >
                <XCircle className="w-3 h-3" />
                반려
              </Btn>
            )}
            <Btn
              variant="ghost"
              size="sm"
              loading={isActing}
              disabled={isActing}
              onClick={() => deleteTenant(t.tenant_id, t.name)}
              className="!text-red-600 hover:!bg-red-50"
              title="삭제"
              aria-label="삭제"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Btn>
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-5">
      {/* 탭 헤더 */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6">
          {([
            ['tenants', '기관 관리', Building2],
            ['users', '사용자 관리', Users],
            ['audit', '감사 로그', ScrollText],
          ] as [Tab, string, typeof Building2][]).map(([tab, label, Icon]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab !== 'audit' && (
        <Card>
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
            <Upload className="w-4 h-4" />
            CSV 일괄 등록
          </h3>
          <div className="flex flex-col md:flex-row gap-3 md:items-end">
            <div className="flex-1">
              <label htmlFor="admin-csv-file" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">CSV 파일</label>
              <input
                id="admin-csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={e => setBulkFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="mt-1 text-xs text-gray-400 dark:text-gray-300">
                {bulkType === 'users'
                  ? '헤더: email, password, role, tenant_id'
                  : '헤더: tenant_id, name, gov_type, sgg_cd'}
              </p>
            </div>
            <div>
              <label htmlFor="admin-bulk-type" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">등록 유형</label>
              <select
                id="admin-bulk-type"
                value={bulkType}
                onChange={e => setBulkType(e.target.value as typeof bulkType)}
                className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="users">사용자 일괄 등록</option>
                <option value="tenants">기관 일괄 등록</option>
              </select>
            </div>
            <Btn onClick={runBulkUpload} loading={bulkLoading} disabled={!bulkFile || bulkLoading}>
              <Upload className="w-4 h-4" />
              업로드
            </Btn>
          </div>
          {bulkResult && (
            <div className="mt-3 text-sm">
              <p className={bulkResult.fail === 0 ? 'text-green-700' : 'text-gray-700 dark:text-gray-300'}>
                성공 {bulkResult.ok}건 / 실패 {bulkResult.fail}건
              </p>
              {bulkResult.errors.length > 0 && (
                <ul className="mt-1 text-xs text-red-600 list-disc list-inside">
                  {bulkResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              )}
            </div>
          )}
        </Card>
      )}

      {activeTab === 'users' && <UserManagement />}

      {activeTab === 'audit' && <AuditLogViewer />}

      {activeTab === 'tenants' && (<>
        <PageHeader
          title="기관 관리"
          subtitle="입주 기관 등록·승인·반려 (센터 전용)"
          action={
            <Btn size="md" onClick={() => setShowForm(!showForm)}>
              <Plus className="w-4 h-4" />
              {showForm ? '취소' : '기관 등록'}
            </Btn>
          }
        />

        {/* 통계 위젯 */}
        <TenantStats tenants={tenants} />

        {showForm && (
          <Card>
            <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4">신규 기관 등록</h3>
            {error && <div className="mb-3 text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</div>}
            <form onSubmit={createTenant} className="grid md:grid-cols-2 gap-3">
              <div>
                <label htmlFor="admin-tenant-id" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">기관 코드 *</label>
                <input
                  id="admin-tenant-id"
                  required value={form.tenant_id}
                  onChange={e => setForm(p => ({ ...p, tenant_id: e.target.value }))}
                  placeholder="예: gni_hadong"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-300">영문·숫자·언더스코어만 권장합니다.</p>
              </div>
              <div>
                <label htmlFor="admin-tenant-name" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">기관명 *</label>
                <input
                  id="admin-tenant-name"
                  required value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="예: 하동군청"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="admin-gov-type" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">유형</label>
                <select
                  id="admin-gov-type"
                  value={form.gov_type}
                  onChange={e => setForm(p => ({ ...p, gov_type: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">선택</option>
                  <option value="시청">시청</option>
                  <option value="군청">군청</option>
                  <option value="도청">도청</option>
                  <option value="기타">기타</option>
                </select>
              </div>
              <div>
                <label htmlFor="admin-sgg-cd" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">시군 코드</label>
                <input
                  id="admin-sgg-cd"
                  value={form.sgg_cd}
                  onChange={e => setForm(p => ({ ...p, sgg_cd: e.target.value }))}
                  placeholder="예: 48850"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <Btn type="submit" loading={saving}>
                  등록
                </Btn>
              </div>
            </form>
          </Card>
        )}

        {listError && (
          <div className="flex items-center justify-between gap-3 text-red-600 text-sm bg-red-50 px-3 py-2 rounded">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              {listError}
            </span>
            <Btn size="sm" variant="secondary" onClick={reload} loading={refreshing}>
              <RefreshCw className="w-3.5 h-3.5" />
              다시 시도
            </Btn>
          </div>
        )}

        {/* 필터/검색 */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="기관명·코드·시군코드 검색"
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400 dark:text-gray-300" />
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1) }}
              className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">모든 상태</option>
              <option value="pending">승인 대기</option>
              <option value="approved">승인 완료</option>
              <option value="rejected">반려</option>
            </select>
            <select
              value={govFilter}
              onChange={e => { setGovFilter(e.target.value); setPage(1) }}
              className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {GOV_TYPES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <Btn
              variant="ghost"
              size="sm"
              onClick={reload}
              loading={refreshing}
              title="새로고침"
              aria-label="새로고침"
              className="!p-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Btn>
          </div>
        </div>

        {/* 상태 빠른 필터 칩 */}
        <div className="flex flex-wrap items-center gap-2">
          {([
            ['all', '전체', tenants.length],
            ['pending', '승인 대기', statusCounts.pending],
            ['approved', '승인 완료', statusCounts.approved],
            ['rejected', '반려', statusCounts.rejected],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => { setStatusFilter(key as typeof statusFilter); setPage(1) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                statusFilter === key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-950'
              }`}
            >
              {label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                statusFilter === key ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}>
                {count}
              </span>
            </button>
          ))}
          {isFiltered && (
            <button
              onClick={resetFilters}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 underline"
            >
              필터 초기화
            </button>
          )}
        </div>

        <Card className="overflow-hidden p-0">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-b flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              총 {filtered.length}개 기관
              {filtered.length !== tenants.length && <span className="text-gray-400 dark:text-gray-300 font-normal"> (전체 {tenants.length}개)</span>}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-300">
              입주 중: {tenants.filter(t => t.onboarded).length}개
            </span>
          </div>
          <SortableTable
            caption="기관 목록"
            data={pageItems}
            keyExtractor={t => t.tenant_id}
            minWidth={900}
            maxHeight={560}
            columns={tenantColumns}
            empty={
              <EmptyState
                icon={<Building2 className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
                title="조건에 맞는 기관이 없습니다"
                description={
                  isFiltered
                    ? '검색어나 필터를 조정해 보세요.'
                    : '아직 등록된 기관이 없습니다. 기관 등록 버튼으로 추가해 보세요.'
                }
                action={isFiltered ? { label: '필터 초기화', onClick: resetFilters } : undefined}
              />
            }
          />

          {/* 페이징 */}
          {totalPages > 1 && (
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-t flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {page} / {totalPages} 페이지 (총 {filtered.length}개)
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                  aria-label="이전 페이지"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[28px] h-7 px-1.5 text-xs rounded font-medium ${
                      page === p ? 'bg-blue-600 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
                  aria-label="다음 페이지"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </Card>
      </>)}
    </div>
  )
}
