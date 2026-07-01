'use client'

import { Component, type ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {

    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center min-h-[240px] gap-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 dark:text-red-400" aria-hidden="true" />
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">오류가 발생했습니다</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {this.state.error?.message || '화면을 불러오는 중 문제가 생겼습니다.'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            다시 시도
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
