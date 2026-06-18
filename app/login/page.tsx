'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import toast from 'react-hot-toast'
import Input from '@/components/ui/Input'
import Label from '@/components/ui/Label'
import FormError from '@/components/ui/FormError'

interface FormErrors {
  email?: string
  password?: string
}

export default function LoginPage() {
  const supabase = createClient()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [errors,   setErrors]   = useState<FormErrors>({})

  function validate(): boolean {
    const next: FormErrors = {}
    if (!email.trim()) {
      next.email = '이메일을 입력해주세요.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = '올바른 이메일 형식이 아닙니다.'
    }
    if (!password) {
      next.password = '비밀번호를 입력해주세요.'
    } else if (password.length < 6) {
      next.password = '비밀번호는 6자 이상이어야 합니다.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      toast.error('이메일 또는 비밀번호가 올바르지 않습니다.')
      return
    }
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] px-4">
      <div className="w-full max-w-[380px]">
        {/* 브랜드 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-200">
            <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">이음(EUM)</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">경남 공공데이터 개방 플랫폼</p>
        </div>

        {/* 카드 */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm ring-1 ring-gray-200/80 p-8">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-6">로그인</h2>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="email" required>이메일</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value)
                  if (errors.email) setErrors(prev => ({ ...prev, email: undefined }))
                }}
                autoComplete="email"
                placeholder="user@example.com"
                error={errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              <FormError id="email-error" message={errors.email} />
            </div>
            <div>
              <Label htmlFor="password" required>비밀번호</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value)
                    if (errors.password) setErrors(prev => ({ ...prev, password: undefined }))
                  }}
                  autoComplete="current-password"
                  error={errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-gray-400"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <FormError id="password-error" message={errors.password} />
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl
                         hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 transition-colors mt-2 shadow-sm"
            >
              {loading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="50" strokeDashoffset="30" />
                </svg>
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-600 dark:text-gray-300 mt-6">
          경남빅데이터센터 GNI · 데이터 허브 플랫폼
        </p>
      </div>
    </div>
  )
}
