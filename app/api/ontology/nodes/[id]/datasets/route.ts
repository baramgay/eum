import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/openapi'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const pub = createPublicClient()

  const { data: node } = await pub
    .from('onto_objects')
    .select('obj_id,label,obj_type,props')
    .eq('obj_id', id)
    .maybeSingle()

  if (!node) return NextResponse.json({ error: '노드를 찾을 수 없습니다' }, { status: 404 })

  const label = ((node.label as string | null) ?? '').trim()
  const terms = label.split(/[\s,·]+/).filter((t) => t.length > 1)

  if (terms.length === 0) {
    return NextResponse.json({
      datasets: [],
      node: { obj_id: node.obj_id, label: node.label, obj_type: node.obj_type },
    })
  }

  const filters = terms
    .map((t) => `title.ilike.%${t}%,keywords.ilike.%${t}%,theme.ilike.%${t}%,description.ilike.%${t}%`)
    .join(',')

  const { data: datasets, error: dbErr } = await pub
    .from('catalog')
    .select('dataset_id,title,theme,keywords,description,format,rows,updated_at,is_open,ai_ready')
    .or(filters)
    .order('updated_at', { ascending: false })
    .limit(10)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({
    datasets: datasets ?? [],
    node: { obj_id: node.obj_id, label: node.label, obj_type: node.obj_type },
  })
}
