import {
  serializeSnapshot,
  parseSnapshot,
  listWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from '@/lib/ontology/workspace'
import type { WorkspaceSnapshot, OntologyWorkspace } from '@/lib/ontology/types'

describe('workspace helpers', () => {
  describe('serializeSnapshot / parseSnapshot', () => {
    it('serializes and parses a snapshot round-trip', () => {
      const snapshot: WorkspaceSnapshot = {
        name: 'test',
        sgg: '48120',
        layout: 'force',
        selectedNodeId: 'node:1',
        activeRels: ['contains'],
        activeTypes: ['시군'],
        nodeSearch: '창원',
      }
      const serialized = serializeSnapshot(snapshot)
      expect(typeof serialized).toBe('string')
      expect(parseSnapshot(serialized)).toEqual(snapshot)
    })

    it('handles empty snapshot', () => {
      expect(parseSnapshot('{}')).toEqual({})
      expect(parseSnapshot(null)).toEqual({})
      expect(parseSnapshot(undefined)).toEqual({})
    })

    it('gracefully returns empty object for invalid JSON string', () => {
      expect(parseSnapshot('not-json')).toEqual({})
    })

    it('passes through object snapshot', () => {
      const snapshot = { layout: 'radial' } as WorkspaceSnapshot
      expect(parseSnapshot(snapshot)).toEqual(snapshot)
    })
  })

  describe('CRUD with mock fetch', () => {
    let requests: { method: string; url: string; body?: unknown }[] = []

    beforeEach(() => {
      requests = []
      jest.resetAllMocks()
    })

    function mockFetch(response: Response) {
      global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        requests.push({
          method: init?.method ?? 'GET',
          url: url.toString(),
          body: init?.body ? JSON.parse(init.body as string) : undefined,
        })
        return response
      })
    }

    function jsonResponse(body: unknown, status = 200) {
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    }

    it('listWorkspaces calls GET /api/ontology/workspace and returns workspaces', async () => {
      const workspaces: OntologyWorkspace[] = [
        {
          id: 'ws-1',
          user_id: 'u-1',
          name: '첫 워크스페이스',
          snapshot: { layout: 'force' },
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ]
      mockFetch(jsonResponse({ workspaces }))

      const result = await listWorkspaces()
      expect(result).toEqual(workspaces)
      expect(requests).toHaveLength(1)
      expect(requests[0]).toMatchObject({ method: 'GET', url: expect.stringContaining('/api/ontology/workspace') })
    })

    it('createWorkspace calls POST with name and snapshot', async () => {
      const workspace: OntologyWorkspace = {
        id: 'ws-2',
        user_id: 'u-1',
        name: '새 워크스페이스',
        snapshot: { layout: 'hierarchical' },
        created_at: '2026-01-02T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      }
      mockFetch(jsonResponse({ workspace }))

      const result = await createWorkspace({ name: workspace.name, snapshot: workspace.snapshot })
      expect(result).toEqual(workspace)
      expect(requests[0]).toMatchObject({
        method: 'POST',
        body: { name: workspace.name, snapshot: workspace.snapshot },
      })
    })

    it('updateWorkspace calls PUT with id, name and snapshot', async () => {
      const workspace: OntologyWorkspace = {
        id: 'ws-3',
        user_id: 'u-1',
        name: '수정된 워크스페이스',
        snapshot: { layout: 'radial' },
        created_at: '2026-01-03T00:00:00Z',
        updated_at: '2026-01-03T12:00:00Z',
      }
      mockFetch(jsonResponse({ workspace }))

      const result = await updateWorkspace(workspace.id, { name: workspace.name, snapshot: workspace.snapshot })
      expect(result).toEqual(workspace)
      expect(requests[0]).toMatchObject({
        method: 'PUT',
        body: { id: workspace.id, name: workspace.name, snapshot: workspace.snapshot },
      })
    })

    it('deleteWorkspace calls DELETE with id', async () => {
      mockFetch(jsonResponse({ success: true }))

      await deleteWorkspace('ws-4')
      expect(requests[0]).toMatchObject({
        method: 'DELETE',
        body: { id: 'ws-4' },
      })
    })

    it('throws on non-OK response with server error message', async () => {
      mockFetch(jsonResponse({ error: '인증이 필요합니다' }, 401))
      await expect(listWorkspaces()).rejects.toThrow('인증이 필요합니다')
    })

    it('throws fallback error on non-OK response without message', async () => {
      mockFetch(new Response('', { status: 500 }))
      await expect(listWorkspaces()).rejects.toThrow('500')
    })
  })
})
