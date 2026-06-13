'use client'

import type { Row, ProcessError } from '@/lib/processor'

interface PreviewPanelProps {
  before: Row[]
  after:  Row[]
  errors: ProcessError[]
}

function errKey(rowIndex: number, col: string) {
  return `${rowIndex}:${col}`
}

export default function PreviewPanel({ before, after, errors }: PreviewPanelProps) {
  const errorSet = new Set(errors.map(e => errKey(e.rowIndex, e.column ?? '')))

  function renderTable(rows: Row[], title: string, highlightErrors: boolean) {
    if (!rows.length) return (
      <div className="flex-1">
        <p className="text-xs font-semibold text-gray-500 mb-1">{title}</p>
        <p className="text-sm text-gray-400 italic">데이터 없음</p>
      </div>
    )
    const cols = Object.keys(rows[0])
    return (
      <div className="flex-1 overflow-auto">
        <p className="text-xs font-semibold text-gray-500 mb-1">{title} ({rows.length}행)</p>
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr className="bg-gray-100">
              {cols.map(c => (
                <th key={c} className="border px-2 py-1 text-left font-medium text-gray-700 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-gray-50">
                {cols.map(c => {
                  const isErr = highlightErrors && errorSet.has(errKey(ri, c))
                  return (
                    <td
                      key={c}
                      className={`border px-2 py-1 whitespace-nowrap ${isErr ? 'bg-red-100 text-red-700' : ''}`}
                    >
                      {row[c] == null ? <span className="text-gray-300">null</span> : String(row[c])}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex gap-4">
        {renderTable(before, '변환 전', false)}
        {renderTable(after,  '변환 후', true)}
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-xs font-semibold text-red-700 mb-2">오류 목록 ({errors.length}건)</p>
          <ul className="space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="text-xs text-red-600">
                행 {e.rowIndex + 1} / 규칙 {e.ruleIndex + 1}
                {e.column && ` / 컬럼: ${e.column}`} — {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
