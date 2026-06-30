import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { recordAccessLog } from '@/lib/telemetry'

// 개발 단계 인증 우회 — 프로덕션에서는 항상 비활성화
const DEV_BYPASS = process.env.NODE_ENV !== 'production' && process.env.DEV_BYPASS === 'true'

// 인증 없이 접근 가능한 경로
// 주의: /api/ 전체를 공개로 열면 모든 API 인증이 각 route에만 의존하므로 명시적으로 한정
const PUBLIC_PREFIXES = [
  '/login',
  '/api/v1/',              // 공개 데이터 포털 API
  '/api/dcat',             // DCAT 메타데이터 (공공데이터 표준)
  '/api/cron/',            // Vercel Cron (CRON_SECRET 자체 인증)
  '/api/openapi/webhooks', // 웹훅 수신 (각 route에서 인증)
  '/api/health',           // 서버 상태 확인
  '/api/ontology/demo-graph/', // 샘플 시나리오 그래프 (인증 불필요)
  '/api/ontology/text-analysis', // 텍스트 분석 (로컬 연산)
]

export async function middleware(request: NextRequest) {
  const startMs = performance.now()
  let supabaseResponse = NextResponse.next({ request })

  const logAccess = (res: Response) => {
    const responseMs = Math.round(performance.now() - startMs)
    recordAccessLog({
      endpoint: request.nextUrl.pathname,
      method: request.method,
      status_code: res.status,
      response_ms: responseMs,
      user_id: user?.id ?? null,
    })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cs: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cs.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cs.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as never))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  // 개발 bypass: 모든 인증·역할 검사 생략, 그대로 통과
  if (DEV_BYPASS) {
    logAccess(supabaseResponse)
    return supabaseResponse
  }

  const isPublic = PUBLIC_PREFIXES.some(p => pathname.startsWith(p))

  // 미인증 사용자가 보호 경로 접근 → API는 JSON 401, 페이지는 로그인으로
  if (!user && !isPublic) {
    if (pathname.startsWith('/api/')) {
      const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      logAccess(res)
      return res
    }
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    const res = NextResponse.redirect(loginUrl)
    logAccess(res)
    return res
  }

  // 인증된 사용자가 로그인 페이지 접근 → 대시보드로
  if (user && pathname === '/login') {
    const homeUrl = request.nextUrl.clone()
    homeUrl.pathname = '/'
    const res = NextResponse.redirect(homeUrl)
    logAccess(res)
    return res
  }

  // 센터 전용 경로 역할 검사
  const isAdminPage = pathname.startsWith('/admin')
  const isAdminApi = pathname.startsWith('/api/admin/')
  const isCompareApi = pathname === '/api/evaluation/compare' || pathname.startsWith('/api/evaluation/compare/')

  if (user && (isAdminPage || isAdminApi || isCompareApi) && user.user_metadata?.role !== 'center') {
    if (isAdminPage) {
      const homeUrl = request.nextUrl.clone()
      homeUrl.pathname = '/'
      const res = NextResponse.redirect(homeUrl)
      logAccess(res)
      return res
    }
    const res = NextResponse.json({ error: '센터 권한이 필요합니다' }, { status: 403 })
    logAccess(res)
    return res
  }

  logAccess(supabaseResponse)
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
