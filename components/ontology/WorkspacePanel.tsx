'use client'

import { useEffect, useState, useCallback } from 'react'
import { Save, FolderOpen, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react'
import { Card, Badge, Btn } from '@/components/ui'
import { useApi } from '@/lib/hooks/useApi'
import type { WorkspaceSnapshot, OntologyWorkspace } from '@/lib/ontology/types'
import {
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from '@/lib/ontology/workspace'

interface WorkspacePanelProps {
  snapshot: WorkspaceSnapshot
  onLoad: (snapshot: WorkspaceSnapshot) => void
}

export default function WorkspacePanel({ snapshot, onLoad }: WorkspacePanelProps) {
  const {
    data: workspaces,
    loading,
    error,
    execute: refresh,
    setError,
  } = useApi(listWorkspaces)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleSave = useCallback(async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      await createWorkspace({ name: trimmed, snapshot })
      setName('')
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '워크스페이스 저장 중 오류가 발생했습니다')
    } finally {
      setSaving(false)
    }
  }, [name, snapshot, refresh, setError])

  const handleRename = useCallback(async (id: string) => {
    const trimmed = editName.trim()
    if (!trimmed) return
    setError(null)
    try {
      await updateWorkspace(id, { name: trimmed })
      setEditingId(null)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '워크스페이스 이름 수정 중 오류가 발생했습니다')
    }
  }, [editName, refresh, setError])

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('워크스페이스를 삭제하시겠습니까?')) return
    setError(null)
    try {
      await deleteWorkspace(id)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '워크스페이스 삭제 중 오류가 발생했습니다')
    }
  }, [refresh, setError])

  const startEdit = useCallback((ws: OntologyWorkspace) => {
    setEditingId(ws.id)
    setEditName(ws.name)
  }, [])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditName('')
  }, [])

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
    } catch {
      return iso
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          워크스페이스
        </h3>
        <Badge variant="gray" size="sm">{(workspaces ?? []).length}개</Badge>
      </div>

      {/* Save new */}
      <div className="flex gap-2">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="새 워크스페이스 이름"
          className="flex-1 min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        />
        <Btn onClick={handleSave} loading={saving} disabled={!name.trim()} size="sm">
          <Save className="w-3.5 h-3.5" />
          저장
        </Btn>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl p-3 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* List */}
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 dark:text-gray-300 text-sm gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중...
          </div>
        ) : (workspaces ?? []).length === 0 ? (
          <div className="text-center py-8 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100">
            <FolderOpen className="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-200" />
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">저장된 워크스페이스가 없습니다</p>
          </div>
        ) : (
          (workspaces ?? []).map(ws => (
            <div
              key={ws.id}
              className="flex items-center justify-between gap-2 p-3 border rounded-xl hover:bg-gray-50 dark:hover:bg-gray-950 transition-colors"
            >
              {editingId === ws.id ? (
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="flex-1 min-w-0 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm"
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRename(ws.id)
                      if (e.key === 'Escape') cancelEdit()
                    }}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                  />
                  <Btn onClick={() => handleRename(ws.id)} variant="ghost" size="sm" className="!p-1 h-auto">
                    <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                  </Btn>
                  <Btn onClick={cancelEdit} variant="ghost" size="sm" className="!p-1 h-auto">
                    <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-300" />
                  </Btn>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{ws.name}</p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-300">{formatDate(ws.updated_at)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Btn onClick={() => onLoad(ws.snapshot)} variant="secondary" size="sm">
                      불러오기
                    </Btn>
                    <Btn onClick={() => startEdit(ws)} variant="ghost" size="sm" className="!p-1 h-auto" title="이름 변경">
                      <Edit2 className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                    </Btn>
                    <Btn onClick={() => handleDelete(ws.id)} variant="ghost" size="sm" className="!p-1 h-auto" title="삭제">
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Btn>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
