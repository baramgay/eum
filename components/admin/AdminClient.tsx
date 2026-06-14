'use client'

import { useState, useMemo } from 'react'
import {
  Search, Filter, CheckCircle, XCircle, Building2, Plus, Trash2,
  ChevronLeft, ChevronRight, RefreshCw, Users, ExternalLink,
} from 'lucide-react'
import UserManagement from './UserManagement'

type TenantStatus = 'pending' | 'approved' | 'rejected'

interface Tenant {
  tenant_id: string
  name: string
  gov_type: string | null
  sgg_cd: string | null
  onboarded: boolean
  status?: TenantStatus
  created_at?: string
}

interface Props { initialTenants: Tenant[] }

type Tab = 'tenants' | 'users'

const STATUS_LABEL: Record<TenantStatus, { label: string; cls: string }> = {
  pending:  { label: '승인 대기', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  approved: { label: '승인 완료', cls: 'bg-green-100 text-green-700 border-green-200' },
  rejected: { label: '반려',     cls: 'bg-red-100 text-red-700 border-red-200' },
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
  const [form, setForm]               = useState({ tenant_id: '', name: '', gov_type: '', sgg_cd: '' })
  const [actionId, setActionId]       = useState<string | null>(null)

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

  async function reload() {
    const r = await fetch('/api/tenants')
    if (!r.ok) return
    const d = await r.json()
    setTenants(Array.isArray(d) ? d : [])
  }

  async function updateStatus(t: Tenant, status: TenantStatus) {
    setActionId(t.tenant_id)
    const r = await fetch(`/api/tenants/${t.tenant_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setActionId(null)
    if (!r.ok) return
    setTenants(prev => prev.map(x => x.tenant_id === t.tenant_id ? { ...x, status, onboarded: status === 'approved' } : x))
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
    const r = await fetch('/api/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
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
    await fetch(`/api/tenants/${id}`, { method: 'DELETE' })
    setTenants(prev => prev.filter(t => t.tenant_id !== id))
  }

  const stats = useMemo(() => ({
    total: tenants.length,
    pending: tenants.filter(t => (t.status ?? 'pending') === 'pending').length,
    approved: tenants.filter(t => (t.status ?? 'pending') === 'approved').length,
    rejected: tenants.filter(t => (t.status ?? 'pending') === 'rejected').length,
    onboarded: tenants.filter(t => t.onboarded).length,
  }), [tenants])

  return (
    <div className="space-y-5">
      {/* 탭 헤더 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {([
            ['tenants', '기관 관리', Building2],
            ['users', '사용자 관리', Users],
          ] as [Tab, string, typeof Building2][]).map(([tab, label, Icon]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'users' && <UserManagement />}

      {activeTab === 'tenants' && (<>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">기관 관리</h2>
            <p className="text-sm text-gray-500 mt-0.5">입주 기관 등록·승인·반려 (센터 전용)</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            {showForm ? '취소' : '기관 등록'}
          </button>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: '전체 기관', value: stats.total, cls: 'bg-gray-50 text-gray-700' },
            { label: '승인 대기', value: stats.pending, cls: 'bg-yellow-50 text-yellow-700' },
            { label: '승인 완료', value: stats.approved, cls: 'bg-green-50 text-green-700' },
            { label: '반려', value: stats.rejected, cls: 'bg-red-50 text-red-700' },
            { label: '입주 중', value: stats.onboarded, cls: 'bg-blue-50 text-blue-700' },
          ].map(s => (
            <div key={s.label} className={`rounded-lg border p-3 text-center ${s.cls.split(' ')[0]}`}>
              <p className="text-xl font-bold">{s.value}</p>
              <p className={`text-xs mt-0.5 ${s.cls.split(' ')[1]}`}>{s.label}</p>
            </div>
          ))}
        </div>

        {showForm && (
          <div className="bg-white rounded-lg border p-5 shadow-sm">
            <h3 className="font-medium text-gray-800 mb-4">신규 기관 등록</h3>
            {error && <div className="mb-3 text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</div>}
            <form onSubmit={createTenant} className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">기관 코드 *</label>
                <input
                  required value={form.tenant_id}
                  onChange={e => setForm(p => ({ ...p, tenant_id: e.target.value }))}
                  placeholder="예: gni_hadong"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">기관명 *</label>
                <input
                  required value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="예: 하동군청"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">유형</label>
                <select
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
                <label className="block text-xs font-medium text-gray-600 mb-1">시군 코드</label>
                <input
                  value={form.sgg_cd}
                  onChange={e => setForm(p => ({ ...p, sgg_cd: e.target.value }))}
                  placeholder="예: 48850"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit" disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? '등록 중...' : '등록'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 필터/검색 */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              placeholder="기관명·코드·시군코드 검색"
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
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
            <button
              onClick={reload}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
              title="새로고침"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-medium text-gray-700">
              총 {filtered.length}개 기관
              {filtered.length !== tenants.length && <span className="text-gray-400 font-normal"> (전체 {tenants.length}개)</span>}
            </span>
            <span className="text-xs text-gray-400">
              입주 중: {stats.onboarded}개
            </span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">기관 코드</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">기관명</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">유형</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">시군코드</th>
                <th className="px-4 py-2 text-center text-gray-600 font-medium">승인 상태</th>
                <th className="px-4 py-2 text-center text-gray-600 font-medium">입주 여부</th>
                <th className="px-4 py-2 text-center text-gray-600 font-medium">포털</th>
                <th className="px-4 py-2 text-center text-gray-600 font-medium">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageItems.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">조건에 맞는 기관이 없습니다.</td></tr>
              ) : pageItems.map(t => {
                const status: TenantStatus = t.status ?? 'pending'
                return (
                  <tr key={t.tenant_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{t.tenant_id}</td>
                    <td className="px-4 py-2 font-medium text-gray-800">{t.name}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{t.gov_type ?? '—'}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{t.sgg_cd ?? '—'}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_LABEL[status].cls}`}>
                        {STATUS_LABEL[status].label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <button
                        onClick={() => toggleOnboarded(t)}
                        disabled={actionId === t.tenant_id}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          t.onboarded
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        } disabled:opacity-50`}
                      >
                        {t.onboarded ? '입주 중' : '미입주'}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <a
                        href={`/portal?tenant_id=${encodeURIComponent(t.tenant_id)}`}
                        className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        title="해당 기관 데이터셋 보기"
                      >
                        <ExternalLink className="w-3 h-3" />
                        보기
                      </a>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {status !== 'approved' && (
                          <button
                            onClick={() => updateStatus(t, 'approved')}
                            disabled={actionId === t.tenant_id}
                            className="flex items-center gap-0.5 px-2 py-1 text-xs bg-green-50 text-green-700 rounded hover:bg-green-100 disabled:opacity-50"
                            title="승인"
                          >
                            <CheckCircle className="w-3 h-3" />
                            승인
                          </button>
                        )}
                        {status !== 'rejected' && (
                          <button
                            onClick={() => updateStatus(t, 'rejected')}
                            disabled={actionId === t.tenant_id}
                            className="flex items-center gap-0.5 px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100 disabled:opacity-50"
                            title="반려"
                          >
                            <XCircle className="w-3 h-3" />
                            반려
                          </button>
                        )}
                        <button
                          onClick={() => deleteTenant(t.tenant_id, t.name)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded"
                          title="삭제"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* 페이징 */}
          {totalPages > 1 && (
            <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {page} / {totalPages} 페이지 (총 {filtered.length}개)
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[28px] h-7 px-1.5 text-xs rounded font-medium ${
                      page === p ? 'bg-blue-600 text-white' : 'hover:bg-gray-200 text-gray-600'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1 rounded hover:bg-gray-200 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </>)}
    </div>
  )
}
