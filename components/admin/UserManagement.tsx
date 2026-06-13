'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, RefreshCw, UserCog } from 'lucide-react'

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
  center:  { label: '센터 관리자', cls: 'bg-purple-100 text-purple-700' },
  agency:  { label: '기관',        cls: 'bg-blue-100 text-blue-700'   },
  viewer:  { label: '열람자',       cls: 'bg-gray-100 text-gray-600'   },
}

function RoleBadge({ role }: { role: string }) {
  const r = ROLE_LABELS[role] ?? { label: role, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.cls}`}>{r.label}</span>
}

function fmtDate(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit' })
}

export default function UserManagement() {
  const [users, setUsers]         = useState<UserRecord[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editingRole, setEditingRole] = useState<Record<string, string>>({})
  const [form, setForm] = useState({ email: '', password: '', role: 'agency', tenant_id: '' })

  const loadUsers = useCallback(async () => {
    setLoading(true); setError('')
    const r = await fetch('/api/admin/users')
    if (!r.ok) { setError('사용자 목록을 불러오지 못했습니다'); setLoading(false); return }
    const d = await r.json()
    setUsers(d.users ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
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
    await loadUsers()
  }

  async function changeRole(uid: string, role: string) {
    setEditingRole(p => ({ ...p, [uid]: role }))
    await fetch(`/api/admin/users/${uid}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    setUsers(prev => prev.map(u => u.id === uid ? { ...u, role } : u))
    setEditingRole(p => { const n = { ...p }; delete n[uid]; return n })
  }

  async function deleteUser(uid: string, email: string) {
    if (!confirm(`"${email}" 계정을 삭제하시겠습니까?`)) return
    setDeletingId(uid)
    await fetch(`/api/admin/users/${uid}`, { method: 'DELETE' })
    setDeletingId(null)
    setUsers(prev => prev.filter(u => u.id !== uid))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">사용자 관리</h2>
          <p className="text-sm text-gray-500 mt-0.5">계정 등록·역할 변경·삭제 (센터 전용)</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadUsers}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md"
            title="새로고침"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            <Plus size={14} />
            {showForm ? '취소' : '사용자 등록'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg border p-5 shadow-sm">
          <h3 className="font-medium text-gray-800 mb-4 flex items-center gap-2">
            <UserCog size={16} />신규 사용자 등록
          </h3>
          {error && <div className="mb-3 text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</div>}
          <form onSubmit={createUser} className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">이메일 *</label>
              <input
                required type="email" value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="user@example.com"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">비밀번호 *</label>
              <input
                required type="password" value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="8자 이상"
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">역할 *</label>
              <select
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="center">센터 관리자</option>
                <option value="agency">기관</option>
                <option value="viewer">열람자</option>
              </select>
            </div>
            {form.role === 'agency' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">기관 코드</label>
                <input
                  value={form.tenant_id}
                  onChange={e => setForm(p => ({ ...p, tenant_id: e.target.value }))}
                  placeholder="예: 48121"
                  className="w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
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

      {!showForm && error && (
        <div className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded">{error}</div>
      )}

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <span className="text-sm font-medium text-gray-700">총 {users.length}명</span>
        </div>
        {loading ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">불러오는 중...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">이메일</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">역할</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">기관 코드</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">마지막 로그인</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">이메일 인증</th>
                <th className="px-4 py-2 text-center text-gray-600 font-medium">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    등록된 사용자가 없습니다.
                  </td>
                </tr>
              ) : users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800">
                    {u.email}
                    {u.banned_until && new Date(u.banned_until) > new Date() && (
                      <span className="ml-2 text-xs text-red-500">(비활성)</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={editingRole[u.id] ?? u.role}
                      onChange={e => changeRole(u.id, e.target.value)}
                      className="text-xs border rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="center">센터 관리자</option>
                      <option value="agency">기관</option>
                      <option value="viewer">열람자</option>
                    </select>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {u.tenant_id ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(u.last_sign_in_at)}</td>
                  <td className="px-4 py-2">
                    {u.confirmed_at
                      ? <span className="text-xs text-green-600">인증됨</span>
                      : <span className="text-xs text-yellow-600">미인증</span>
                    }
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button
                      onClick={() => deleteUser(u.id, u.email)}
                      disabled={deletingId === u.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40 flex items-center gap-1 mx-auto"
                    >
                      <Trash2 size={12} />
                      {deletingId === u.id ? '삭제 중...' : '삭제'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
