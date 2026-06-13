'use client'

import { useState } from 'react'
import UserManagement from './UserManagement'

interface Tenant {
  tenant_id: string; name: string; gov_type: string | null
  sgg_cd: string | null; onboarded: boolean
}

interface Props { initialTenants: Tenant[] }

type Tab = 'tenants' | 'users'

export default function AdminClient({ initialTenants }: Props) {
  const [activeTab, setActiveTab]  = useState<Tab>('tenants')
  const [tenants, setTenants]     = useState<Tenant[]>(initialTenants)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')
  const [form, setForm]           = useState({ tenant_id: '', name: '', gov_type: '', sgg_cd: '' })
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function reload() {
    const r = await fetch('/api/tenants')
    setTenants(await r.json())
  }

  async function toggleOnboarded(t: Tenant) {
    await fetch(`/api/tenants/${t.tenant_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onboarded: !t.onboarded }),
    })
    setTenants(prev => prev.map(x => x.tenant_id === t.tenant_id ? { ...x, onboarded: !x.onboarded } : x))
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

  async function deleteTenant(id: string) {
    setDeletingId(id)
    await fetch(`/api/tenants/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    setTenants(prev => prev.filter(t => t.tenant_id !== id))
  }

  return (
    <div className="space-y-5">
      {/* 탭 헤더 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {([['tenants', '기관 관리'], ['users', '사용자 관리']] as [Tab, string][]).map(([tab, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'users' && <UserManagement />}
      {activeTab === 'tenants' && (<>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">기관 관리</h2>
          <p className="text-sm text-gray-500 mt-0.5">입주 기관 등록·관리 (센터 전용)</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          {showForm ? '취소' : '기관 등록'}
        </button>
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

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">총 {tenants.length}개 기관</span>
          <span className="text-xs text-gray-400">
            입주 중: {tenants.filter(t => t.onboarded).length}개
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-2 text-left text-gray-600 font-medium">기관 코드</th>
              <th className="px-4 py-2 text-left text-gray-600 font-medium">기관명</th>
              <th className="px-4 py-2 text-left text-gray-600 font-medium">유형</th>
              <th className="px-4 py-2 text-left text-gray-600 font-medium">시군코드</th>
              <th className="px-4 py-2 text-center text-gray-600 font-medium">입주 여부</th>
              <th className="px-4 py-2 text-center text-gray-600 font-medium">동작</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tenants.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">등록된 기관이 없습니다.</td></tr>
            ) : tenants.map(t => (
              <tr key={t.tenant_id} className="hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs text-gray-500">{t.tenant_id}</td>
                <td className="px-4 py-2 font-medium text-gray-800">{t.name}</td>
                <td className="px-4 py-2 text-gray-500 text-xs">{t.gov_type ?? '—'}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500">{t.sgg_cd ?? '—'}</td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => toggleOnboarded(t)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      t.onboarded
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {t.onboarded ? '입주 중' : '미입주'}
                  </button>
                </td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => {
                      if (confirm(`"${t.name}" 기관을 삭제하시겠습니까?`)) deleteTenant(t.tenant_id)
                    }}
                    disabled={deletingId === t.tenant_id}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                  >
                    {deletingId === t.tenant_id ? '삭제 중...' : '삭제'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  )
}
