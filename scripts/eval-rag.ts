/**
 * RAG(Retrieval-Augmented Generation) 검색 성능 평가 스크립트
 *
 * 사용법:
 *   bash -c 'set -a; source .env.local; set +a; npx tsx scripts/eval-rag.ts'
 *
 * 각 질문에 대해 retrieveContext 를 호출하고, 기대하는 테이블/테마가
 * 상위 결과에 포함되는지를 Recall@K 로 측정합니다.
 */
import { createClient } from '@supabase/supabase-js'
import { retrieveContext } from '../lib/ai/retriever'

interface Case {
  question: string
  expectedTables?: string[]
  expectedThemes?: string[]
}

const cases: Case[] = [
  {
    question: '청년 인구 현황이 궁금해',
    expectedTables: ['gold_youth', 'gold_population'],
    expectedThemes: ['청년'],
  },
  {
    question: '사업체 수와 종사자 수를 알려줘',
    expectedTables: ['gold_business'],
    expectedThemes: ['산업·고용'],
  },
  {
    question: '지난달 데이터 등록 현황',
    expectedTables: ['submissions'],
    expectedThemes: ['데이터등록'],
  },
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const results: Array<{
    question: string
    recallTable: number
    recallTheme: number
    top3: string[]
  }> = []

  for (const c of cases) {
    const start = Date.now()
    const ctx = await retrieveContext(supabase, c.question)
    const elapsed = Date.now() - start

    const top3 = ctx.slice(0, 3)
    const topText = top3.map(r => `${r.title} [${r.source}]`).join(' | ')
    const topTextBlob = top3.map(r => `${r.title} ${r.snippet}`).join(' ').toLowerCase()

    const recallTable = c.expectedTables
      ? c.expectedTables.filter(t => topTextBlob.includes(t.toLowerCase())).length / c.expectedTables.length
      : 1
    const recallTheme = c.expectedThemes
      ? c.expectedThemes.filter(t => topTextBlob.includes(t.toLowerCase())).length / c.expectedThemes.length
      : 1

    results.push({ question: c.question, recallTable, recallTheme, top3: top3.map(r => r.title) })
    console.log(`[${elapsed}ms] ${c.question}`)
    console.log(`  top3: ${topText}`)
    console.log(`  recallTable=${recallTable.toFixed(2)} recallTheme=${recallTheme.toFixed(2)}`)
  }

  const avgTable = results.reduce((s, r) => s + r.recallTable, 0) / results.length
  const avgTheme = results.reduce((s, r) => s + r.recallTheme, 0) / results.length

  console.log('\n=== RAG 평가 요약 ===')
  console.log(`케이스 수: ${results.length}`)
  console.log(`평균 Recall@3 (table): ${avgTable.toFixed(2)}`)
  console.log(`평균 Recall@3 (theme): ${avgTheme.toFixed(2)}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
