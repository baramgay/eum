import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { OntologyWorkspace, WorkspaceSnapshot } from '@/lib/ontology/types'

const TABLE = 'ontology_workspaces'

function responseWorkspace(row: OntologyWorkspace) {
  return NextResponse.json({ workspace: row })
}

// GET: list current user's workspaces
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ workspaces: (data ?? []) as OntologyWorkspace[] })
}

// POST: create workspace
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 요청입니다' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: '워크스페이스 이름은 필수입니다' }, { status: 400 })
  }

  const snapshot = (body.snapshot ?? {}) as WorkspaceSnapshot

  const { data, error } = await supabase
    .from(TABLE)
    .insert({ user_id: user.id, name, snapshot })
    .select('*')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? '워크스페이스 생성에 실패했습니다' },
      { status: 500 },
    )
  }

  return responseWorkspace(data as OntologyWorkspace)
}

// PUT: update workspace by id
export async function PUT(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 요청입니다' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) {
    return NextResponse.json({ error: '워크스페이스 ID는 필수입니다' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string') update.name = body.name.trim()
  if (body.snapshot !== undefined) update.snapshot = body.snapshot as WorkspaceSnapshot

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '수정할 내용이 없습니다' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? '워크스페이스를 찾을 수 없거나 수정 권한이 없습니다' },
      { status: error?.code === 'PGRST116' ? 404 : 500 },
    )
  }

  return responseWorkspace(data as OntologyWorkspace)
}

// DELETE: delete workspace by id
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 JSON 요청입니다' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) {
    return NextResponse.json({ error: '워크스페이스 ID는 필수입니다' }, { status: 400 })
  }

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
