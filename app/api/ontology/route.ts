import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildOntology, getGraph, listActions } from '@/lib/ontology'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 })
  }
  return NextResponse.json(await buildOntology(supabase))
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  if (type === 'actions') {
    return NextResponse.json(listActions())
  }

  const sgg = searchParams.get('sgg') ?? ''
  const supabase = await createClient()
  return NextResponse.json(await getGraph(supabase, sgg || undefined))
}
