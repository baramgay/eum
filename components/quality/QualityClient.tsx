'use client'

import { useEffect, useState } from 'react'

interface QualityResult {
  dataset_id: string; table_name: string; rule_name: string
  passed: boolean; message: string; checked_at: string
}

export default function QualityClient() {
  const [results, setResults]   = useState<QualityResult[]>([])
  const [loading, setLoading]   = useState(true)
  const [running, setRunning]   = useState(false)

  async function load() {
    setLoading(true)
    const r = await fetch('/api/quality')
    setResults(await r.json())
    setLoading(false)
  }

  async function runAll() {
    setRunning(true)
    await fetch('/api/quality', { method: 'POST' })
    await load()
    setRunning(false)
  }

  useEffect(() => { load() }, [])

  const passed = results.filter(r => r.passed).length
  const total  = results.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">품질 진단</h2>
          {total > 0 && (
            <p className="text-sm text-gray-500 mt-0.5">{passed}/{total} 규칙 통과</p>
          )}
        </div>
        <button
          onClick={runAll} disabled={running}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? '실행 중...' : '전체 재검사'}
        </button>
      </div>
      {loading ? (
        <div className="text-center py-8 text-gray-400">로딩 중...</div>
      ) : results.length === 0 ? (
        <div className="text-center py-8 text-gray-400">품질 검사 결과가 없습니다. 전체 재검사를 실행하세요.</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">데이터셋</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">규칙</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">결과</th>
                <th className="px-4 py-2 text-left text-gray-600 font-medium">메시지</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 font-mono text-xs">{r.table_name}</td>
                  <td className="px-4 py-2 text-gray-600">{r.rule_name}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      r.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>{r.passed ? '통과' : '실패'}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
