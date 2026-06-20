import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ subscribed: false })

  const { data } = await supabase
    .from('catalog_subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('dataset_id', id)
    .maybeSingle()

  return NextResponse.json({ subscribed: !!data })
}

export async function POST(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const { error } = await supabase
    .from('catalog_subscriptions')
    .upsert({ user_id: user.id, dataset_id: id }, { onConflict: 'user_id,dataset_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })

  const { error } = await supabase
    .from('catalog_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('dataset_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
