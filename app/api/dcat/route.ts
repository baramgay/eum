export const runtime = 'nodejs'

import { createPublicClient, buildDcatCatalog } from '@/lib/openapi'
import { headers } from 'next/headers'

export async function GET() {
  const sb = createPublicClient()

  const { data, error } = await sb
    .from('catalog')
    .select('dataset_id, tenant_id, title, description, theme, keywords, license, format, updated_at')
    .eq('is_open', true)
    .order('updated_at', { ascending: false })

  if (error) {
    return Response.json({ error: '카탈로그 조회 실패' }, { status: 500 })
  }

  const headerStore = await headers()
  const host   = headerStore.get('host') ?? 'localhost:3000'
  const proto  = headerStore.get('x-forwarded-proto') ?? 'http'
  const baseUrl = `${proto}://${host}`

  const catalog = buildDcatCatalog((data ?? []) as Record<string, unknown>[], baseUrl)

  return new Response(JSON.stringify(catalog, null, 2), {
    headers: { 'Content-Type': 'application/ld+json; charset=utf-8' },
  })
}
