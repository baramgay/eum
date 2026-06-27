'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RefreshCw, UserCog, Building2, Filter, Users, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input, Select } from '@/components/ui'
import Card from '@/components/ui/Card'
import Btn from '@/components/ui/Btn'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'

interface Tenant { tenant_id: string; name: string; gov_type: string | null }

interface UserRecord {
  id: string
  email: string
  role: string
  tenant_id: string | null
  created_at: string
  last_sign_in_at: string | null
  confirmed_at: string | null
  banned_until: string | null
}

const ROLE_LABELS: Record<string, { label: string; cls: string }> = {
  admin:   { label: '최고 관리자', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'       },
  center:  { label: '센터 관리자', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' },
  agency:  { label: '기관',        cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'   },
  viewer:  { label: '열람자',       cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'     },
  public:  { label: '일반 공개',   cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' },
}

function RoleBadge({ role }: { role: string }) {
  const r = ROLE_LABELS[role] ?? { label: role, cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.cls}`}>{r.label}</span>
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

function SkeletonRows({ cols = 7 }: { cols?: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          <td colSpan={cols} className="px-4 py-2">
            <Skeleton className="h-8 w-full" />
          </td>
        </tr>
      ))}
    </>
  )
}

const PAGE_SIZE = 20

function isPasswordCompliant(password: string): boolean {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)
}

export default function UserManagement() {
  const [users, setUsers]         = useState<UserRecord[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [actingId, setActingId]   = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ email: '', password: '', role: 'agency', tenant_id: '' })
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'center' | 'agency' | 'viewer' | 'public'>('all')
  const [page, setPage]           = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const loadUsers = useCallback(async (targetPage = 1) => {
    setLoading(true); setError('')
    const r = await fetch(`/api/admin/users?page=${targetPage}&per_page=${PAGE_SIZE}`)
    if (!r.ok) { setError('사용자 목록을 불러오지 못했습니다'); setLoading(false); return }
    const d = await r.json()
    setUsers(d.users ?? [])
    setPage(d.pagination?.page ?? targetPage)
    setTotalPages(Math.max(1, Math.ceil((d.pagination?.total ?? 0) / PAGE_SIZE)))
    setLoading(false)
  }, [])

  useEffect(() => { loadUsers(1) }, [loadUsers])

  useEffect(() => {
    fetch('/api/tenants')
      .then(r => r.json())
      .then((d: Tenant[]) => setTenants(Array.isArray(d) ? d : []))
      .catch(() => setTenants([]))
  }, [])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    if (!isPasswordCompliant(form.password)) {
      setError('비밀번호는 8자 이상이며 영문 대소문자와 숫자를 포함해야 합니다')
      return
    }
    setSaving(true); setError('')
    const r = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const d = await r.json()
    setSaving(false)
    if (!r.ok) { setError(d.error ?? '생성 실패'); return }
    setShowForm(false)
    setForm({ email: '', password: '', role: 'agency', tenant_id: '' })
    await loadUsers(page)
  }

  async function changeField(uid: string, field: 'role' | 'tenant_id', value: string | null) {
    setEditingRole(p => ({ ...p, [uid]: field === 'role' ? (value ?? '') : p[uid] }))
    const endpoint = field === 'role'
      ? `/api/admin/users/${uid}/role`
      : `/api/admin/users/${uid}`
    await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    setUsers(prev => prev.map(u => u.id === uid ? { ...u, [field]: value } : u))
    setEditingRole(p => { const n = { ...p }; delete n[uid]; return n })
  }

  async function toggleBanned(u: UserRecord) {
    setActingId(u.id)
    const now = new Date()
    const currentlyBanned = u.banned_until && new Date(u.banned_until) > now
    const nextBannedUntil = currentlyBanned ? null : new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000).toISOString()
    await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ banned_until: nextBannedUntil }),
    })
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, banned_until: nextBannedUntil } : x))
    setActingId(null)
  }

  async function deleteUser(uid: string, email: string) {
    if (!confirm(`"${email}" 계정을 삭제하시겠습니까?`)) return
    setDeletingId(uid)
    await fetch(`/api/admin/users/${uid}`, { method: 'DELETE' })
    setDeletingId(null)
    setUsers(prev => prev.filter(u => u.id !== uid))
  }

  const filteredUsers = roleFilter === 'all' ? users : users.filter(u => u.role === roleFilter)
  const isBusy = (uid: string) => actingId === uid || deletingId === uid

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">사용자 관리</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">계정 등록·역할 변경·삭제 (센터 전용)</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" size="sm" onClick={() => loadUsers(page)} loading={loading} title="새로고침" className="!p-2">
            <RefreshCw size={16} />
          </Btn>
          <Btn size="md" onClick={() => setShowForm(!showForm)}>
            <Plus size={14} />
            {showForm ? '취소' : '사용자 등록'}
          </Btn>
        </div>
      </div>

      {showForm && (
        <Card>
          <h3 className="font-medium text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
            <UserCog size={16} />신규 사용자 등록
          </h3>
          {error && <div className="mb-3 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">{error}</div>}
          <form onSubmit={createUser} className="grid md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="user-email" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">이메일 *</label>
              <Input
                id="user-email"
                required type="email" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="user@example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="user-password" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">비밀번호 *</label>
              <Input
                id="user-password"
                required type="password" value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="8자 이상"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="user-role" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">역할 *</label>
              <Select
                id="user-role"
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="admin">최고 관리자</option>
                <option value="center">센터 관리자</option>
                <option value="agency">기관</option>
                <option value="viewer">열람자</option>
                <option value="public">일반 공개</option>
              </Select>
            </div>
            {form.role === 'agency' && (
              <div>
                <label htmlFor="user-tenant" className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">소속 기관</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
                  <Select
                    id="user-tenant"
                    value={form.tenant_id}
                    onChange={e => setForm(p => ({ ...p, tenant_id: e.target.value }))}
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 dark:text-gray-100"
                  >
                    <option value="">기관 선택</option>
                    {tenants.map(t => (
                      <option key={t.tenant_id} value={t.tenant_id}>
                        {t.name} ({t.tenant_id})
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )}
            <div className="md:col-span-2">
              <Btn type="submit" loading={saving}>
                등록
              </Btn>
            </div>
          </form>
        </Card>
      )}

      {!showForm && error && (
        <div className="flex items-center justify-between gap-3 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
          <span>{error}</span>
          <Btn size="sm" variant="secondary" onClick={() => loadUsers(page)} loading={loading}>
            <RefreshCw size={14} />
            다시 시도
          </Btn>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400 dark:text-gray-300" />
        <Select
          value={roleFilter}
          onChange={e => setRoleFilter(e.target.value as typeof roleFilter)}
          className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="all">모든 역할</option>
          <option value="admin">최고 관리자</option>
          <option value="center">센터 관리자</option>
          <option value="agency">기관</option>
          <option value="viewer">열람자</option>
          <option value="public">일반 공개</option>
        </Select>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-b">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            총 {filteredUsers.length}명
          </span>
        </div>
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-950 border-b sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">이메일</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">역할</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">기관 코드</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">마지막 로그인</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">이메일 인증</th>
                <th className="px-4 py-2 text-center text-gray-600 dark:text-gray-400 font-medium">활성화</th>
                <th className="px-4 py-2 text-center text-gray-600 dark:text-gray-400 font-medium">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <SkeletonRows />
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6">
                    <EmptyState
                      icon={<Users className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
                      title={roleFilter === 'all' ? '등록된 사용자가 없습니다' : '선택한 역할의 사용자가 없습니다'}
                      description={roleFilter === 'all' ? '사용자 등록 버튼으로 계정을 추가해 보세요.' : '필터를 변경해 보세요.'}
                      action={{ label: '새로고침', onClick: () => loadUsers(page) }}
                    />
                  </td>
                </tr>
              ) : filteredUsers.map(u => {
                const banned = u.banned_until && new Date(u.banned_until) > new Date()
                return (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200">
                      {u.email}
                      {banned && (
                        <span className="ml-2 text-xs text-red-500">(비활성)</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={editingRole[u.id] ?? u.role}
                        onChange={e => changeField(u.id, 'role', e.target.value)}
                        disabled={isBusy(u.id)}
                        className="text-xs border border-gray-300 dark:border-gray-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 bg-white dark:bg-gray-900 dark:text-gray-100"
                      >
                        <option value="admin">최고 관리자</option>
                        <option value="center">센터 관리자</option>
                        <option value="agency">기관</option>
                        <option value="viewer">열람자</option>
                        <option value="public">일반 공개</option>
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={u.tenant_id ?? ''}
                        onChange={e => changeField(u.id, 'tenant_id', e.target.value || null)}
                        disabled={isBusy(u.id)}
                        className="text-xs border border-gray-300 dark:border-gray-700 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 max-w-[160px] bg-white dark:bg-gray-900 dark:text-gray-100"
                      >
                        <option value="">—</option>
                        {tenants.map(t => (
                          <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400">{fmtDate(u.last_sign_in_at)}</td>
                    <td className="px-4 py-2">
                      {u.confirmed_at
                        ? <span className="text-xs text-green-600 dark:text-green-400">인증됨</span>
                        : <span className="text-xs text-yellow-600 dark:text-yellow-400">미인증</span>
                      }
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Btn
                        variant="ghost"
                        size="sm"
                        loading={actingId === u.id}
                        disabled={isBusy(u.id)}
                        onClick={() => toggleBanned(u)}
                        className={banned
                          ? '!text-green-700 dark:!text-green-300 hover:!bg-green-50'
                          : '!text-red-700 dark:!text-red-300 hover:!bg-red-50'
                        }
                      >
                        {banned ? '활성화' : '비활성화'}
                      </Btn>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Btn
                        variant="ghost"
                        size="sm"
                        loading={deletingId === u.id}
                        disabled={isBusy(u.id)}
                        onClick={() => deleteUser(u.id, u.email)}
                        className="!text-red-600 dark:!text-red-400 hover:!bg-red-50"
                      >
                        <Trash2 size={12} />
                        삭제
                      </Btn>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-t flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {page} / {totalPages} 페이지
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => loadUsers(Math.max(1, page - 1))}
                disabled={page === 1 || loading}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => loadUsers(p)}
                  disabled={loading}
                  className={`min-w-[28px] h-7 px-1.5 text-xs rounded font-medium ${
                    page === p ? 'bg-blue-600 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => loadUsers(Math.min(totalPages, page + 1))}
                disabled={page === totalPages || loading}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
