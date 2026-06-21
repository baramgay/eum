'use client'

import { useMemo, useState } from 'react'
import type { Row, ProcessError } from '@/lib/processor'
import { Badge } from '@/components/ui'
import { AlertCircle, Columns, Rows } from 'lucide-react'

interface PreviewPanelProps {
  before: Row[]
  after:  Row[]
  errors: ProcessError[]
}

interface PreviewSummary {
  inputRows:  number
  outputRows: number
  errorRows:  number
  inputCols:  number
  outputCols: number
}

const PAGE_SIZE = 10

function errKey(rowIndex: number, col: string) {
  return `${rowIndex}:${col}`
}

function formatCell(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return v.toISOString()
  return String(v)
}

export default function PreviewPanel({ before, after, errors }: PreviewPanelProps) {
  const [beforePage, setBeforePage] = useState(0)
  const [afterPage, setAfterPage]   = useState(0)

  const errorSet = useMemo(() =>
    new Set(errors.map(e => errKey(e.rowIndex, e.column ?? ''))),
    [errors]
  )

  const summary: PreviewSummary = useMemo(() => ({
    inputRows:  before.length,
    outputRows: after.length,
    errorRows:  new Set(errors.map(e => e.rowIndex)).size,
    inputCols:  before.length > 0 ? Object.keys(before[0]).length : 0,
    outputCols: after.length > 0 ? Object.keys(after[0]).length : 0,
  }), [before, after, errors])

  const changedCells = useMemo(() => {
    const changed = new Set<string>()
    const len = Math.min(before.length, after.length)
    for (let i = 0; i < len; i++) {
      const b = before[i]
      const a = after[i]
      const cols = new Set([...Object.keys(b), ...Object.keys(a)])
      for (const c of cols) {
        if (formatCell(b[c]) !== formatCell(a[c])) {
          changed.add(errKey(i, c))
        }
      }
    }
    return changed
  }, [before, after])

  function renderTable(
    rows: Row[],
    title: string,
    page: number,
    setPage: (p: number) => void,
    highlightErrors: boolean,
    highlightChanges: boolean,
  ) {
    if (!rows.length) return (
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{title}</p>
        <p className="text-sm text-gray-400 dark:text-gray-300 italic">데이터 없음</p>
      </div>
    )

    const cols = Object.keys(rows[0])
    const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
    const start = page * PAGE_SIZE
    const pageRows = rows.slice(start, start + PAGE_SIZE)

    return (
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">{title} ({rows.length}행 / {cols.length}열)</p>
          {pageCount > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-1.5 py-0.5 text-xs border rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-950"
              >◀</button>
              <span className="text-xs text-gray-500 dark:text-gray-400">{page + 1}/{pageCount}</span>
              <button
                onClick={() => setPage(Math.min(pageCount - 1, page + 1))}
                disabled={page === pageCount - 1}
                className="px-1.5 py-0.5 text-xs border rounded disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-950"
              >▶</button>
            </div>
          )}
        </div>
        <div className="overflow-auto border rounded">
          <table className="text-xs border-collapse w-full">
            <thead className="sticky top-0">
              <tr className="bg-gray-100 dark:bg-gray-800">
                {cols.map(c => (
                  <th key={c} className="border px-2 py-1 text-left font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, ri) => {
                const absoluteIndex = start + ri
                return (
                  <tr key={ri} className="hover:bg-gray-50 dark:hover:bg-gray-950">
                    {cols.map(c => {
                      const isErr = highlightErrors && errorSet.has(errKey(absoluteIndex, c))
                      const isChanged = highlightChanges && changedCells.has(errKey(absoluteIndex, c))
                      return (
                        <td
                          key={c}
                          className={`border px-2 py-1 whitespace-nowrap ${
                            isErr ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : isChanged ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' : ''
                          }`}
                          title={isChanged ? '변경됨' : undefined}
                        >
                          {row[c] == null ? <span className="text-gray-300 dark:text-gray-200">null</span> : String(row[c])}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="blue"><Rows className="w-3 h-3 inline mr-1" />입력 {summary.inputRows}행</Badge>
        <Badge variant="green"><Rows className="w-3 h-3 inline mr-1" />출력 {summary.outputRows}행</Badge>
        <Badge variant="purple"><Columns className="w-3 h-3 inline mr-1" />출력 {summary.outputCols}열</Badge>
        {summary.errorRows > 0 && (
          <Badge variant="red"><AlertCircle className="w-3 h-3 inline mr-1" />오류 {summary.errorRows}행</Badge>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-300 ml-auto">변경 셀은 연두색, 오류 셀은 빨간색으로 표시</span>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {renderTable(before, '변환 전', beforePage, setBeforePage, false, false)}
        {renderTable(after,  '변환 후', afterPage, setAfterPage, true, true)}
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-3">
          <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-2">오류 목록 ({errors.length}건)</p>
          <ul className="space-y-1 max-h-40 overflow-auto">
            {errors.map((e, i) => (
              <li key={i} className="text-xs text-red-600 dark:text-red-400">
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
