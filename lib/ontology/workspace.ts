import type { WorkspaceSnapshot, OntologyWorkspace } from './types'
import { apiClient } from '@/lib/api/client'

export interface CreateWorkspaceInput {
  name: string
  snapshot: WorkspaceSnapshot
}

export interface UpdateWorkspaceInput {
  name?: string
  snapshot?: WorkspaceSnapshot
}

export interface WorkspaceListResponse {
  workspaces: OntologyWorkspace[]
}

export interface WorkspaceResponse {
  workspace: OntologyWorkspace
}

const API_URL = '/api/ontology/workspace'

export function serializeSnapshot(snapshot: WorkspaceSnapshot): string {
  return JSON.stringify(snapshot)
}

export function parseSnapshot(raw: string | object | null | undefined): WorkspaceSnapshot {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as WorkspaceSnapshot
    } catch {
      return {}
    }
  }
  return raw as WorkspaceSnapshot
}

export async function listWorkspaces(): Promise<OntologyWorkspace[]> {
  const data = await apiClient<WorkspaceListResponse>(API_URL, {
    fallbackMessage: status => `워크스페이스 목록 조회 실패 (${status})`,
  })
  return data.workspaces
}

export async function createWorkspace(input: CreateWorkspaceInput): Promise<OntologyWorkspace> {
  const data = await apiClient<WorkspaceResponse>(API_URL, {
    method: 'POST',
    body: input,
    fallbackMessage: status => `워크스페이스 생성 실패 (${status})`,
  })
  return data.workspace
}

export async function updateWorkspace(id: string, input: UpdateWorkspaceInput): Promise<OntologyWorkspace> {
  const data = await apiClient<WorkspaceResponse>(API_URL, {
    method: 'PUT',
    body: { id, ...input },
    fallbackMessage: status => `워크스페이스 수정 실패 (${status})`,
  })
  return data.workspace
}

export async function deleteWorkspace(id: string): Promise<void> {
  await apiClient(API_URL, {
    method: 'DELETE',
    body: { id },
    fallbackMessage: status => `워크스페이스 삭제 실패 (${status})`,
  })
}
