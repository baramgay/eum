export const runtime = 'nodejs'

import { withApiKey, scopeAllows } from '@/lib/openapi'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  return withApiKey(req, async ({ sb, auth }) => {
    const { data, error } = await sb
      .from('catalog')
      .select('*')
      .eq('dataset_id', id)
      .eq('is_open', true)
      .maybeSingle()

    if (error) {
      return Response.json({ error: '데이터셋 조회 실패' }, { status: 500 })
    }
    if (!data) {
      return Response.json({ error: '데이터셋을 찾을 수 없습니다' }, { status: 404 })
    }

    if (!scopeAllows(auth.scope!, id)) {
      return Response.json({ error: '이 데이터셋에 대한 접근 권한이 없습니다' }, { status: 403 })
    }

    return Response.json({ data })
  })
}
