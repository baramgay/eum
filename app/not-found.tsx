import Link from 'next/link'
import { Search, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
        <Search className="w-10 h-10 text-gray-400 dark:text-gray-500" aria-hidden="true" />
      </div>
      <h1 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100">404</h1>
      <h2 className="mt-2 text-xl font-semibold text-gray-800 dark:text-gray-200">페이지를 찾을 수 없습니다</h2>
      <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 max-w-sm">
        요청하신 페이지가 존재하지 않거나 이동되었습니다. 입력하신 주소를 다시 확인해주세요.
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors"
      >
        <Home className="w-4 h-4" aria-hidden="true" />
        홈으로 돌아가기
      </Link>
    </div>
  )
}
