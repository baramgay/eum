import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SIGUN_LIST = [
  '창원시', '진주시', '통영시', '사천시', '김해시', '밀양시',
  '거제시', '양산시', '의령군', '함안군', '창녕군', '고성군',
  '남해군', '하동군', '산청군', '함양군', '거창군', '합천군',
]

interface CatalogRow {
  theme: string | null
}

interface ExampleItem {
  category: string
  label: string
  q: string
}

const THEME_TEMPLATES: Record<string, { category: string; patterns: string[] }> = {
  '정착': { category: '정착', patterns: ['{sigun} 청년 정착잠재 현황', '청년 정착잠재 순위 보여줘'] },
  '잠재': { category: '정착', patterns: ['{sigun} 청년 정착잠재 현황', '정착잠재지수 상위 시군'] },
  '인구': { category: '인구', patterns: ['{sigun} 청년 인구 유출입 현황', '청년 인구 유입이 많은 시군'] },
  '유출': { category: '인구', patterns: ['{sigun} 청년 인구 유출입 현황', '청년 인구 유입 순위'] },
  '사업체': { category: '사업체', patterns: ['{sigun} 사업체 현황', '경남 사업체 수 순위'] },
  '고용': { category: '사업체', patterns: ['{sigun} 고용 현황', '경남 종사자 수 순위'] },
  '제조업': { category: '제조업', patterns: ['{sigun} 제조업 사업체 현황', '경남 제조업 현황'] },
  '제조': { category: '제조업', patterns: ['{sigun} 제조업 현황', '경남 제조업체 순위'] },
  '시설': { category: '시설', patterns: ['{sigun} 청년센터', '경남 청년공간 시설 현황'] },
  '인프라': { category: '시설', patterns: ['{sigun} 청년 인프라 현황', '경남 공공시설 현황'] },
  '소득': { category: '소득', patterns: ['{sigun} 월평균 소득', '소득 높은 시군 순위'] },
  '신용': { category: '소득', patterns: ['{sigun} 신용 현황', '경남 평균 신용점수 순위'] },
}

const DEFAULT_EXAMPLES: ExampleItem[] = [
  { category: '정착', label: '정착잠재 순위', q: '청년 정착잠재 순위 보여줘' },
  { category: '사업체', label: '창원시 사업체', q: '창원시 사업체 현황' },
  { category: '인구', label: '거창 청년인구', q: '거창군 청년 인구 유입 현황' },
  { category: '소득', label: '소득 높은 시군', q: '소득 높은 시군 순위' },
  { category: '시설', label: '거제 청년센터', q: '거제시 청년센터' },
  { category: '제조업', label: '경남 제조업', q: '경남 제조업 사업체 현황' },
  { category: '인구', label: '인구 유입 순위', q: '청년 인구 유입이 많은 시군' },
]

function pickSigun(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i)
    hash |= 0
  }
  const idx = Math.abs(hash) % SIGUN_LIST.length
  return SIGUN_LIST[idx]
}

function normalizeTheme(theme: string | null): string | null {
  if (!theme) return null
  const t = theme.trim()
  if (THEME_TEMPLATES[t]) return t
  // 복합 주제에서 첫 번째 매칭되는 키워드 사용
  const keys = Object.keys(THEME_TEMPLATES).sort((a, b) => b.length - a.length)
  return keys.find(k => t.includes(k)) ?? null
}

function buildExamples(rows: CatalogRow[]): ExampleItem[] {
  const themes = Array.from(
    new Set(rows.map(r => normalizeTheme(r.theme)).filter((t): t is string => Boolean(t)))
  )

  const examples: ExampleItem[] = []
  const seen = new Set<string>()

  for (const theme of themes) {
    const tmpl = THEME_TEMPLATES[theme]
    const sigun = pickSigun(theme)
    const pattern = tmpl.patterns[examples.length % tmpl.patterns.length]
    const q = pattern.replace('{sigun}', sigun)
    if (seen.has(q)) continue
    seen.add(q)
    examples.push({
      category: tmpl.category,
      label: q.replace(/보여줘|알려줘|현황|순위/g, '').trim().slice(0, 12) || q.slice(0, 12),
      q,
    })
    if (examples.length >= 10) break
  }

  // 카탈로그 기반 예시가 너무 적으면 기본 예시로 보강
  if (examples.length < 5) {
    for (const ex of DEFAULT_EXAMPLES) {
      if (!seen.has(ex.q)) {
        examples.push(ex)
        seen.add(ex.q)
      }
      if (examples.length >= 8) break
    }
  }

  return examples.length > 0 ? examples : DEFAULT_EXAMPLES
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('catalog')
      .select('theme')
      .eq('ai_ready', true)
      .limit(50)

    if (error) throw error

    const examples = buildExamples((data ?? []) as CatalogRow[])
    return NextResponse.json({ examples, generatedAt: new Date().toISOString() })
  } catch {
    return NextResponse.json({ examples: DEFAULT_EXAMPLES, generatedAt: new Date().toISOString() })
  }
}
