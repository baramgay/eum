'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, Key, Trash2, Plus, Loader2, AlertCircle } from 'lucide-react'
import { Card, Btn, Badge, Input } from '@/components/ui'
import Modal from '@/components/ui/Modal'
import toast from 'react-hot-toast'

interface ApiKey {
  key_id: string
  key_prefix: string
  tenant_id: string | null
  scope: { type: string; ids?: string[] }
  is_active: boolean
  expires_at: string | null
  created_at: string
  last_used_at: string | null
  call_count: number
}

interface NewKey extends ApiKey { plain: string }

export default function ApiKeyManager() {
  const [keys, setKeys]           = useState<ApiKey[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [newKey, setNewKey]       = useState<NewKey | null>(null)
  const [copied, setCopied]       = useState(false)
  const [issuing, setIssuing]     = useState(false)
  const [revokeId, setRevokeId]   = useState<string | null>(null)
  const [showIssueForm, setShowIssueForm] = useState(false)
  const [form, setForm] = useState({ tenant_id: '', expires_days: '365' })

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/api-keys')
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      setKeys(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleIssue = async () => {
    setIssuing(true)
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id:   form.tenant_id.trim() || undefined,
          expires_days: form.expires_days ? Number(form.expires_days) : undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      const data = await res.json() as NewKey
      setNewKey(data)
      setShowIssueForm(false)
      setForm({ tenant_id: '', expires_days: '365' })
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발급에 실패했습니다')
    } finally {
      setIssuing(false)
    }
  }

  const handleRevoke = async (id: string) => {
    if (!confirm('API 키를 비활성화하시겠습니까?')) return
    setRevokeId(id)
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`)
      toast.success('API 키가 비활성화되었습니다')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '비활성화에 실패했습니다')
    } finally {
      setRevokeId(null)
    }
  }

  const copyKey = () => {
    if (!newKey?.plain) return
    navigator.clipboard.writeText(newKey.plain)
    setCopied(true)
    toast.success('API 키가 클립보드에 복사되었습니다')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">API 키 관리</h3>
        <Btn size="sm" onClick={() => setShowIssueForm(true)}>
          <Plus className="w-3.5 h-3.5" /> 키 발급
        </Btn>
      </div>

      {/* 신규 발급 키 표시 (1회) */}
      {newKey && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              API 키가 발급되었습니다. 지금 복사하세요 — 다시 표시되지 않습니다.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <code className="flex-1 text-xs font-mono bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-700 rounded px-3 py-2 text-gray-800 dark:text-gray-200 break-all">
              {newKey.plain}
            </code>
            <Btn size="sm" onClick={copyKey}>
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </Btn>
          </div>
          <button
            className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors duration-150"
            onClick={() => setNewKey(null)}
          >
            닫기
          </button>
        </div>
      )}

      {/* 키 발급 폼 */}
      {showIssueForm && (
        <Modal open onClose={() => setShowIssueForm(false)} title="API 키 발급" size="sm">
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="api-tenant-id" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                기관 ID (선택)
              </label>
              <Input
                id="api-tenant-id"
                type="text"
                value={form.tenant_id}
                onChange={e => setForm(f => ({ ...f, tenant_id: e.target.value }))}
                placeholder="tenant_id 입력 (비워두면 전체)"
                className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label htmlFor="api-expires-days" className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                유효 기간 (일)
              </label>
              <Input
                id="api-expires-days"
                type="number"
                value={form.expires_days}
                onChange={e => setForm(f => ({ ...f, expires_days: e.target.value }))}
                min={1}
                max={3650}
                className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Btn variant="secondary" size="sm" onClick={() => setShowIssueForm(false)}>취소</Btn>
              <Btn size="sm" onClick={handleIssue} loading={issuing} disabled={issuing}>
                <Key className="w-3.5 h-3.5" /> 발급
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* 키 목록 */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400 dark:text-gray-300" /></div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">발급된 API 키가 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {keys.map(k => (
            <Card key={k.key_id} padding="sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono text-gray-700 dark:text-gray-300">{k.key_prefix}...</code>
                    <Badge variant={k.is_active ? 'green' : 'gray'}>{k.is_active ? '활성' : '비활성'}</Badge>
                    {k.tenant_id && (
                      <Badge variant="blue">{k.tenant_id}</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 space-x-3">
                    <span>발급: {new Date(k.created_at).toLocaleDateString('ko-KR')}</span>
                    {k.expires_at && <span>만료: {new Date(k.expires_at).toLocaleDateString('ko-KR')}</span>}
                    <span>호출: {k.call_count.toLocaleString()}회</span>
                    {k.last_used_at && <span>최근: {new Date(k.last_used_at).toLocaleDateString('ko-KR')}</span>}
                  </div>
                </div>
                {k.is_active && (
                  <Btn
                    variant="danger"
                    size="sm"
                    onClick={() => handleRevoke(k.key_id)}
                    loading={revokeId === k.key_id}
                    disabled={revokeId === k.key_id}
                    aria-label="API 키 비활성화"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Btn>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
