import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { OntologyWorkspace } from '@/lib/ontology/types'

const TABLE = 'ontology_workspaces'

function generateToken(): string {
  return randomBytes(16).toString('hex')
}

function shareUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return `${base}/api/ontology/workspace/share?token=${token}`
}

// GET: read-only share lookup (토큰만 알면 접근 가능)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')?.trim() ?? ''
  if (!token) {
    return NextResponse.json({ error: 'token 파라미터는 필수입니다' }, { status: 400 })
  }

  const supabase = await createServiceClient()
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, name, snapshot, notes, created_at, updated_at')
    .eq('share_token', token)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '공유 워크스페이스를 찾을 수 없습니다' }, { status: 404 })
  }

  return NextResponse.json({ workspace: data as OntologyWorkspace, readOnly: true })
}

// POST: create or refresh share token for a workspace
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

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) {
    return NextResponse.json({ error: '워크스페이스 ID는 필수입니다' }, { status: 400 })
  }

  // 기존 워크스페이스 조회 (소유자만)
  const { data: existing, error: fetchError } = await supabase
    .from(TABLE)
    .select('id, share_token')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !existing) {
    return NextResponse.json(
      { error: '워크스페이스를 찾을 수 없거나 수정 권한이 없습니다' },
      { status: 404 },
    )
  }

  const token = existing.share_token ?? generateToken()
  const update: Record<string, unknown> = { share_token: token }
  if (typeof body.notes === 'string') update.notes = body.notes

  const { data, error } = await supabase
    .from(TABLE)
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, name, share_token, notes')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? '공유 링크 생성에 실패했습니다' }, { status: 500 })
  }

  return NextResponse.json({
    workspace: data as Pick<OntologyWorkspace, 'id' | 'name' | 'share_token' | 'notes'>,
    shareUrl: shareUrl(data.share_token as string),
  })
}
