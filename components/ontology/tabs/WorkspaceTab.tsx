'use client'

import { Card } from '@/components/ui'
import WorkspacePanel from '../WorkspacePanel'
import type { WorkspaceSnapshot } from '@/lib/ontology/types'
import type { GraphLayoutType } from '@/lib/ontology/types'

interface WorkspaceTabProps {
  snapshot: WorkspaceSnapshot
  onLoadSnapshot: (snapshot: WorkspaceSnapshot) => void
  sggName: string
  layout: GraphLayoutType
  selectedNodeLabel: string
  activeTypeCount: number
  activeRelCount: number
  nodeSearch: string
}

export default function WorkspaceTab({
  snapshot,
  onLoadSnapshot,
  sggName,
  layout,
  selectedNodeLabel,
  activeTypeCount,
  activeRelCount,
  nodeSearch,
}: WorkspaceTabProps) {
  return (
    <div className="grid lg:grid-cols-3 gap-5 items-start">
      <div className="lg:col-span-2">
        <WorkspacePanel snapshot={snapshot} onLoad={onLoadSnapshot} />
      </div>
      <div className="lg:col-span-1 min-w-0">
        <Card className="space-y-3">
          <h3 className="font-medium text-gray-700 dark:text-gray-300">현재 스냅샷 요약</h3>
          <dl className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex justify-between">
              <dt>시군</dt>
              <dd className="font-medium">{sggName || '전체'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>레이아웃</dt>
              <dd className="font-medium">{layout}</dd>
            </div>
            <div className="flex justify-between">
              <dt>선택 노드</dt>
              <dd className="font-medium">{selectedNodeLabel || '없음'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>활성 타입</dt>
              <dd className="font-medium">{activeTypeCount}개</dd>
            </div>
            <div className="flex justify-between">
              <dt>활성 관계</dt>
              <dd className="font-medium">{activeRelCount}개</dd>
            </div>
            <div className="flex justify-between">
              <dt>검색어</dt>
              <dd className="font-medium">{nodeSearch || '—'}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  )
}
