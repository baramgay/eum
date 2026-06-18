import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { generateSql, validateSql, ensureLimit, buildWhitelist } from '@/lib/ai/nl-to-sql'
import { SlidingWindowRateLimiter } from '@/lib/rate-limit'

const limiter = new SlidingWindowRateLimiter(60_000, 20)

export interface NlToSqlRequest {
  question: string
  sql?: string   // 사용자가 직접 수정한 SQL을 실행할 때
}

export interface NlToSqlResponse {
  sql: string
  explanation: string
  columns: string[]
  result: Record<string, unknown>[]
  rowCount: number
  error?: string
}

async function logQuery(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  payload: {
    user_id: string
    question: string
    sql: string
    success: boolean
    error_msg?: string
    row_count?: number
  },
) {
  try {
    await supabase.from('nl_to_sql_logs').insert({
      user_id: payload.user_id,
      question: payload.question,
      generated_sql: payload.sql,
      success: payload.success,
      error_msg: payload.error_msg ?? null,
      row_count: payload.row_count ?? null,
    })
  } catch {
    // 로그 실패는 본 기능에 영향을 주지 않는다
  }
}

export async function POST(req: NextRequest) {
  // 인증 확인
  const authClient = await createClient()
  const { data: { user }, error: userError } = await authClient.auth.getUser()
  if (userError || !user) {
    return NextResponse.json({ error: '인증되지 않았습니다' }, { status: 401 })
  }

  // 속도 제한 (분당 20회)
  const rate = limiter.isAllowed(user.id)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: '너무 많은 요청입니다. 잠시 후 다시 시도해 주세요.' },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': '20',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rate.resetAt),
        },
      },
    )
  }

  let body: NlToSqlRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON 본문을 파싱할 수 없습니다' }, { status: 400 })
  }

  const question = body.question?.trim()
  if (!question) {
    return NextResponse.json({ error: '질문을 입력하세요' }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // 사용자가 직접 편집한 SQL이 들어온 경우: 생성 단계 건너뜀
  if (body.sql?.trim()) {
    const userSql = ensureLimit(body.sql.trim())
    const whitelist = await buildWhitelist(supabase)
    const validation = validateSql(userSql, whitelist)
    if (!validation.ok) {
      await logQuery(supabase, { user_id: user.id, question, sql: userSql, success: false, error_msg: validation.reason })
      return NextResponse.json({ error: validation.reason ?? 'SQL 검증 실패' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('run_select_sql', { p_sql: userSql })
    const rows: Record<string, unknown>[] = Array.isArray(data) ? data : []
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []

    await logQuery(supabase, {
      user_id: user.id,
      question,
      sql: userSql,
      success: !error,
      error_msg: error?.message,
      row_count: rows.length,
    })

    if (error) {
      return NextResponse.json({ error: `SQL 실행 오류: ${error.message}` }, { status: 422 })
    }

    const response: NlToSqlResponse = {
      sql: userSql,
      explanation: '사용자 수정 SQL',
      columns,
      result: rows,
      rowCount: rows.length,
    }
    return NextResponse.json(response)
  }

  // NL → SQL 생성
  const generated = await generateSql(supabase, question)
  if (!generated) {
    await logQuery(supabase, { user_id: user.id, question, sql: '', success: false, error_msg: 'SQL 생성 실패' })
    return NextResponse.json(
      { error: 'SQL을 생성할 수 없습니다. 질문을 구체적으로 입력해 주세요.' },
      { status: 422 },
    )
  }

  // 생성된 SQL 실행
  const { data, error } = await supabase.rpc('run_select_sql', { p_sql: generated.sql })
  const rows: Record<string, unknown>[] = Array.isArray(data) ? data : []
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  await logQuery(supabase, {
    user_id: user.id,
    question,
    sql: generated.sql,
    success: !error,
    error_msg: error?.message,
    row_count: rows.length,
  })

  if (error) {
    return NextResponse.json({ error: `SQL 실행 오류: ${error.message}` }, { status: 422 })
  }

  const response: NlToSqlResponse = {
    sql: generated.sql,
    explanation: generated.explanation,
    columns,
    result: rows,
    rowCount: rows.length,
  }
  return NextResponse.json(response)
}
