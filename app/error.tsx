'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)

  useEffect(() => {

    console.error(error)
  }, [error])

  const handleReport = async () => {
    if (reporting || reported) return
    setReporting(true)
    try {
      await fetch('/api/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: error.message,
          digest: error.digest,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
        }),
      })
      setReported(true)
    } catch {
      // 신고 실패는 무시
    } finally {
      setReporting(false)
    }
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" aria-hidden="true" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">오류가 발생했습니다</h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 max-w-md">
        {error.message || '요청을 처리하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          다시 시도
        </button>
        <button
          type="button"
          onClick={handleReport}
          disabled={reporting || reported}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
        >
          {reporting && <Loader2 className="w-4 h-4 animate-spin" />}
          {reported ? '신고 완료' : '오류 신고'}
        </button>
      </div>
    </div>
  )
}
