'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, MinusCircle, AlertCircle } from 'lucide-react'

interface RuleDetail { rule: string; violations: number }

interface QualityResult {
  dataset_id: string
  table: string
  rule_count: number
  checked: number
  errors: number
  error_rate: number
  threshold: number
  passed: boolean
  detail: RuleDetail[]
  ran_at: string
}

// 5영역 품질 신호등
interface DimSignal { name: string; label: string; status: 'pass' | 'fail' | 'none'; violations: number; total: number }

function buildDimSignals(results: QualityResult[]): DimSignal[] {
  const dims: Record<string, { violations: number; total: number }> = {
    completeness: { violations: 0, total: 0 },
    accuracy:     { violations: 0, total: 0 },
    consistency:  { violations: 0, total: 0 },
    recency:      { violations: 0, total: 0 },
    metadata:     { violations: 0, total: 0 },
  }
  for (const r of results) {
    for (const d of r.detail) {
      const n = d.rule
      let dim = 'accuracy'
      if (n.includes('NULL') || n.includes('결측')) dim = 'completeness'
      else if (n.includes('연도'))                  dim = 'recency'
      else if (n.includes('정합성'))                dim = 'consistency'
      dims[dim].violations += d.violations
      dims[dim].total += r.checked / r.rule_count
    }
  }
  const label: Record<string, string> = {
    completeness: '완전성',
    accuracy:     '정확성',
    consistency:  '일관성',
    recency:      '최신성',
    metadata:     '메타데이터',
  }
  return Object.entries(dims).map(([name, { violations, total }]) => ({
    name, label: label[name],
    status: total === 0 ? 'none' : violations === 0 ? 'pass' : 'fail',
    violations, total: Math.round(total),
  }))
}

// 평가편람 품질 영역 지표 매핑
interface EvalBadge { code: string; label: string; pass: boolean }

function evalBadges(r: QualityResult): EvalBadge[] {
  return [
    {
      code:  '①-2',
      label: '품질진단 도구',
      // 결과 행 자체가 있으면 도구 적용 완료
      pass:  true,
    },
    {
      code:  '②',
      label: '데이터 값 관리',
      // 오류율이 기준(threshold) 이하이면 충족
      pass:  r.error_rate <= r.threshold,
    },
    {
      code:  '③',
      label: '진단결과 조치',
      // 통과(passed)이면 오류 보완 완료로 간주
      pass:  r.passed,
    },
  ]
}

export default function QualityClient() {
  const [results, setResults]   = useState<QualityResult[]>([])
  const [loading, setLoading]   = useState(true)
  const [running, setRunning]   = useState(false)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/quality')
    const d = await r.json()
    setResults(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function runAll() {
    setRunning(true)
    await fetch('/api/quality', { method: 'POST' })
    await load()
    setRunning(false)
  }

  useEffect(() => { load() }, [])

  const passedCount   = results.filter(r => r.passed).length
  const totalDatasets = results.length
  const totalErrors   = results.reduce((s, r) => s + r.errors, 0)

  // 평가편람 요약: 전체 기준 영역 달성 현황
  const allHaveResults  = totalDatasets > 0
  const valueManagePass = allHaveResults && results.every(r => r.error_rate <= r.threshold)
  const actionPass      = allHaveResults && results.every(r => r.passed)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">품질 진단</h2>
          {totalDatasets > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">
              데이터셋 {passedCount}/{totalDatasets} 통과 · 총 오류 {totalErrors.toLocaleString()}건
            </p>
          )}
        </div>
        <button
          onClick={runAll} disabled={running}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? '실행 중...' : '전체 재검사'}
        </button>
      </div>

      {/* 5영역 품질 신호등 */}
      {totalDatasets > 0 && (
        <div className="bg-white rounded-xl border p-4 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 mb-3">품질 5영역 신호등</p>
          <div className="grid grid-cols-5 gap-3">
            {buildDimSignals(results).map(sig => (
              <div key={sig.name} className="flex flex-col items-center gap-1.5">
                {sig.status === 'pass' ? (
                  <CheckCircle2 className="w-7 h-7 text-green-500" />
                ) : sig.status === 'fail' ? (
                  <XCircle className="w-7 h-7 text-red-500" />
                ) : (
                  <AlertCircle className="w-7 h-7 text-gray-300" />
                )}
                <span className="text-xs font-medium text-gray-700">{sig.label}</span>
                <span className={`text-xs ${
                  sig.status === 'pass' ? 'text-green-600' :
                  sig.status === 'fail' ? 'text-red-600' : 'text-gray-400'
                }`}>
                  {sig.status === 'none' ? '미측정' : sig.violations === 0 ? '이상 없음' : `${sig.violations}건`}
                </span>
              </div>
            ))}
          </div>

          {/* 갭 리포트 */}
          {buildDimSignals(results).some(s => s.status === 'none') && (
            <div className="mt-3 p-2.5 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                <strong>갭:</strong> {buildDimSignals(results).filter(s => s.status === 'none').map(s => s.label).join(', ')} 영역은 측정 규칙이 없습니다.
                추후 해당 영역 규칙 추가를 권장합니다.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 평가편람 영역 요약 배지 */}
      {totalDatasets > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-xl border">
          <span className="text-xs text-gray-500 self-center mr-1">평가편람 품질 영역:</span>
          {[
            { code: '①-2', label: '품질진단 도구 적용', pass: allHaveResults },
            { code: '②',   label: '데이터 값 관리',     pass: valueManagePass },
            { code: '③',   label: '진단결과 조치',      pass: actionPass },
          ].map(b => (
            <span
              key={b.code}
              className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium border ${
                b.pass
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {b.pass
                ? <CheckCircle2 className="w-3 h-3" />
                : <XCircle className="w-3 h-3" />
              }
              {b.code} {b.label}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">로딩 중...</div>
      ) : results.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          품질 검사 결과가 없습니다. <strong>전체 재검사</strong>를 실행하세요.
        </div>
      ) : (
        <div className="space-y-3">
          {results.map(r => {
            const badges = evalBadges(r)
            return (
              <div key={r.dataset_id} className="bg-white rounded-lg border shadow-sm overflow-hidden">
                <div className={`px-4 py-3 flex items-center justify-between ${r.passed ? 'bg-green-50' : 'bg-red-50'}`}>
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      r.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>{r.passed ? '통과' : '실패'}</span>
                    <span className="font-medium text-gray-800 text-sm font-mono">{r.table}</span>
                    <span className="text-xs text-gray-500">규칙 {r.rule_count}종 · 검사 {r.checked.toLocaleString()}건</span>
                  </div>
                  <span className="text-xs text-gray-500">
                    오류율 {r.error_rate.toFixed(4)}% (기준 {r.threshold}%)
                  </span>
                </div>

                {/* 평가편람 지표 연결 배지 */}
                <div className="px-4 py-2 flex items-center gap-1.5 border-b bg-gray-50/50">
                  <span className="text-xs text-gray-400 mr-1">관련 지표:</span>
                  {badges.map(b => (
                    <span
                      key={b.code}
                      title={b.label}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                        b.pass
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {b.pass
                        ? <CheckCircle2 className="w-2.5 h-2.5" />
                        : <MinusCircle className="w-2.5 h-2.5" />
                      }
                      {b.code}
                    </span>
                  ))}
                  <span className="text-xs text-gray-300 ml-1">품질 영역</span>
                </div>

                {r.detail.length > 0 && (
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-gray-100">
                      {r.detail.map((d, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-1.5 text-gray-400 w-8 text-center">{i + 1}</td>
                          <td className="px-4 py-1.5 text-gray-700">{d.rule}</td>
                          <td className="px-4 py-1.5 text-right pr-4">
                            <span className={`px-2 py-0.5 rounded font-medium ${
                              d.violations === 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                            }`}>
                              {d.violations === 0 ? '이상 없음' : `${d.violations.toLocaleString()}건 위반`}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="px-4 py-1.5 bg-gray-50 border-t text-right text-xs text-gray-400">
                  검사일: {new Date(r.ran_at).toLocaleString('ko-KR')}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
