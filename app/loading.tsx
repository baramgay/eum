import { Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <Loader2 className="w-10 h-10 text-blue-600 dark:text-blue-400 animate-spin" aria-hidden="true" />
      <p className="mt-4 text-sm font-medium text-gray-500 dark:text-gray-400">불러오는 중...</p>
    </div>
  )
}
