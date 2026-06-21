'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Filter, RefreshCw, ChevronLeft, ChevronRight,
  ShieldCheck, Building2, User, Key, FileText, ScrollText,
} from 'lucide-react'
import Card from '@/components/ui/Card'
import Btn from '@/components/ui/Btn'
import EmptyState from '@/components/ui/EmptyState'
import Skeleton from '@/components/ui/Skeleton'

interface AuditLog {
  id: number
  actor_id: string | null
  actor_email: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  old_value: unknown
  new_value: unknown
  ip_address: string | null
  created_at: string
}

interface Pagination {
  page: number
  per_page: number
  total: number
  total_pages: number
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  approved:          { label: '승인', color: 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30', icon: ShieldCheck },
  rejected:          { label: '반려', color: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30', icon: ShieldCheck },
  submitted:         { label: '제출', color: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30', icon: FileText },
  review:            { label: '검토', color: 'text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800', icon: FileText },
  created_tenant:    { label: '기관 등록', color: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30', icon: Building2 },
  updated_tenant:    { label: '기관 수정', color: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30', icon: Building2 },
  deleted_tenant:    { label: '기관 삭제', color: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30', icon: Building2 },
  onboarded_tenant:  { label: '입주 처리', color: 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30', icon: Building2 },
  issued_api_key:    { label: 'API 키 발급', color: 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30', icon: Key },
  revoked_api_key:   { label: 'API 키 폐기', color: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30', icon: Key },
  created_user:      { label: '사용자 등록', color: 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30', icon: User },
  updated_user:      { label: '사용자 수정', color: 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30', icon: User },
  deleted_user:      { label: '사용자 삭제', color: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30', icon: User },
  banned_user:       { label: '사용자 비활성', color: 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/30', icon: User },
  unbanned_user:     { label: '사용자 활성', color: 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/30', icon: User },
}

const ACTIONS = Object.keys(ACTION_LABELS)
const RESOURCE_TYPES = ['tenant', 'user', 'api_key', 'submission']

function fmtDate(s: string) {
  return new Date(s).toLocaleString('ko-KR', {
    year: '2-digit', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function summarize(log: AuditLog) {
  const parts: string[] = []
  if (log.resource_type) parts.push(log.resource_type)
  if (log.resource_id) parts.push(log.resource_id)
  if (!parts.length) return '—'
  return parts.join(' / ')
}

function SkeletonRows({ cols = 5 }: { cols?: number }) {
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

export default function AuditLogViewer() {
  const [logs, setLogs]         = useState<AuditLog[]>([])
  const [pagination, setPagination] = useState<Pagination>({ page: 1, per_page: 20, total: 0, total_pages: 1 })
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const [action, setAction]     = useState('')
  const [resourceType, setResourceType] = useState('')
  const [search, setSearch]     = useState('')
  const [from, setFrom]         = useState('')
  const [to, setTo]             = useState('')

  const load = useCallback(async (page: number) => {
    setLoading(true); setError('')
    const sp = new URLSearchParams()
    sp.set('page', String(page))
    sp.set('per_page', String(20))
    if (action) sp.set('action', action)
    if (resourceType) sp.set('resource_type', resourceType)
    if (search.trim()) sp.set('search', search.trim())
    if (from) sp.set('from', from)
    if (to) sp.set('to', to)

    try {
      const r = await fetch(`/api/admin/audit-logs?${sp.toString()}`)
      if (!r.ok) {
        setError('감사 로그를 불러오지 못했습니다')
        setLoading(false)
        return
      }
      const d = await r.json()
      setLogs(d.logs ?? [])
      setPagination(prev => d.pagination ?? prev)
    } catch {
      setError('감사 로그를 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [action, resourceType, search, from, to])

  useEffect(() => { load(1) }, [action, resourceType, search, from, to, load])

  const isFiltered = action || resourceType || search || from || to

  function resetFilters() {
    setAction('')
    setResourceType('')
    setSearch('')
    setFrom('')
    setTo('')
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">감사 로그</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">관리자 동작 이력 조회 (센터 전용)</p>
        </div>
        <Btn variant="ghost" size="sm" onClick={() => load(pagination.page)} loading={loading} title="새로고침" className="!p-2">
          <RefreshCw size={16} />
        </Btn>
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded">
          <span>{error}</span>
          <Btn size="sm" variant="secondary" onClick={() => load(pagination.page)} loading={loading}>
            <RefreshCw size={14} />
            다시 시도
          </Btn>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 md:items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="이메일·리소스 ID 검색"
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400 dark:text-gray-300" />
          <select
            value={action}
            onChange={e => setAction(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">모든 동작</option>
            {ACTIONS.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a].label}</option>
            ))}
          </select>
          <select
            value={resourceType}
            onChange={e => setResourceType(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">모든 리소스</option>
            {RESOURCE_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-gray-400 dark:text-gray-300">~</span>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
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
            총 {pagination.total}건
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-300">
            {pagination.page} / {pagination.total_pages} 페이지
          </span>
        </div>
        <div className="overflow-x-auto max-h-[560px]">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-950 border-b sticky top-0 z-10">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">시간</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">동작</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">실행자</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">리소스</th>
                <th className="px-4 py-2 text-left text-gray-600 dark:text-gray-400 font-medium">변경 요약</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <SkeletonRows />
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6">
                    <EmptyState
                      icon={<ScrollText className="w-6 h-6 text-gray-400 dark:text-gray-300" />}
                      title="조건에 맞는 감사 로그가 없습니다"
                      description={isFiltered ? '필터를 조정해 보세요.' : '아직 기록된 관리자 동작이 없습니다.'}
                      action={{ label: '새로고침', onClick: () => load(pagination.page) }}
                    />
                  </td>
                </tr>
              ) : (
                logs.map(log => {
                  const style = ACTION_LABELS[log.action] ?? { label: log.action, color: 'text-gray-700 bg-gray-100', icon: FileText }
                  const Icon = style.icon
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(log.created_at)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${style.color}`}>
                          <Icon className="w-3 h-3" />
                          {style.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{log.actor_email ?? '—'}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 font-mono">{summarize(log)}</td>
                      <td className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                        {log.new_value ? JSON.stringify(log.new_value).slice(0, 80) : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.total_pages > 1 && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-950 border-t flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {pagination.page} / {pagination.total_pages} 페이지
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => load(Math.max(1, pagination.page - 1))}
                disabled={pagination.page === 1}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: pagination.total_pages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => load(p)}
                  className={`min-w-[28px] h-7 px-1.5 text-xs rounded font-medium ${
                    pagination.page === p ? 'bg-blue-600 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => load(Math.min(pagination.total_pages, pagination.page + 1))}
                disabled={pagination.page === pagination.total_pages}
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
