'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({
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
    Sentry.captureException(error)
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
    <html lang="ko">
      <body className="bg-background text-foreground font-sans antialiased">
        <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center bg-gray-50 dark:bg-gray-950">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400" aria-hidden="true" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">심각한 오류가 발생했습니다</h2>
          <p className="mt-2 text-base text-gray-500 dark:text-gray-400 max-w-md">
            {error.message || '애플리케이션을 불러오는 중 문제가 발생했습니다. 아래 버튼을 눌러 새로고침해주세요.'}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => reset()}
              className="px-5 py-2.5 bg-blue-600 text-white text-base font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              새로고침
            </button>
            <button
              type="button"
              onClick={handleReport}
              disabled={reporting || reported}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 text-base font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              {reporting && <Loader2 className="w-4 h-4 animate-spin" />}
              {reported ? '신고 완료' : '오류 신고'}
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
