'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'

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

  const inputBase = [
    'w-full bg-white text-gray-900 placeholder-gray-400',
    'border border-gray-200 rounded-lg',
    'px-3.5 py-2.5 text-sm',
    'outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent',
    'transition-colors',
  ].join(' ')

  return (
    <div className="min-h-screen flex" style={{ colorScheme: 'light', backgroundColor: '#fff', color: '#111827' }}>
      {/* 좌측 브랜드 패널 (md 이상) */}
      <div className="hidden md:flex md:w-[420px] lg:w-[480px] flex-col justify-between p-10 shrink-0" style={{ backgroundColor: '#111827' }}>
        <div>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <span className="font-semibold tracking-tight" style={{ color: '#fff' }}>이음(EUM)</span>
          </div>

          <div className="mt-16">
            <p className="text-2xl font-bold leading-snug" style={{ color: '#fff' }}>
              경남 공공데이터<br />개방 플랫폼
            </p>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: '#9ca3af' }}>
              경상남도 내 공공기관의 데이터를<br />
              수집·정제·분석·개방하는 통합 허브입니다.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-4">
            {[
              { label: '연동 기관', value: '18+' },
              { label: '공개 데이터셋', value: '240+' },
              { label: '온톨로지 노드', value: '1,200+' },
              { label: '일 평균 조회', value: '3,400+' },
            ].map(item => (
              <div key={item.label} className="rounded-lg p-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <p className="text-xl font-bold" style={{ color: '#fff' }}>{item.value}</p>
                <p className="text-xs mt-0.5" style={{ color: '#9ca3af' }}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs" style={{ color: '#d1d5db' }}>
          경남빅데이터센터 GNI · {new Date().getFullYear()}
        </p>
      </div>

      {/* 우측 로그인 폼 */}
      <div className="flex-1 flex flex-col justify-center items-center px-6 py-12" style={{ backgroundColor: '#f9fafb' }}>
        {/* 모바일 로고 */}
        <div className="md:hidden mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#111827' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <span className="font-semibold" style={{ color: '#111827' }}>이음(EUM)</span>
          </div>
          <p className="text-sm" style={{ color: '#6b7280' }}>경남 공공데이터 개방 플랫폼</p>
        </div>

        <div className="w-full max-w-[360px]">
          <div className="mb-8">
            <h1 className="text-xl font-bold" style={{ color: '#111827' }}>로그인</h1>
            <p className="text-sm mt-1" style={{ color: '#6b7280' }}>계속하려면 계정 정보를 입력하세요.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>
                이메일 <span style={{ color: '#ef4444' }} aria-hidden>*</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => {
                  setEmail(e.target.value)
                  if (errors.email) setErrors(prev => ({ ...prev, email: undefined }))
                }}
                autoComplete="email"
                placeholder="user@example.com"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className={`${inputBase}${errors.email ? ' border-red-300 focus:ring-red-500' : ''}`}
              />
              {errors.email && (
                <p id="email-error" className="mt-1 text-xs" style={{ color: '#dc2626' }} role="alert" aria-live="polite">
                  {errors.email}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>
                비밀번호 <span style={{ color: '#ef4444' }} aria-hidden>*</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value)
                    if (errors.password) setErrors(prev => ({ ...prev, password: undefined }))
                  }}
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className={`${inputBase} pr-10${errors.password ? ' border-red-300 focus:ring-red-500' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  aria-label={showPw ? '비밀번호 숨기기' : '비밀번호 보기'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: '#9ca3af' }}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="mt-1 text-xs" style={{ color: '#dc2626' }} role="alert" aria-live="polite">
                  {errors.password}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-semibold rounded-lg transition-colors mt-1 flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: '#111827', color: '#fff' }}
            >
              {loading ? (
                <>
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
                      strokeDasharray="50" strokeDashoffset="30" />
                  </svg>
                  로그인 중...
                </>
              ) : '로그인'}
            </button>
          </form>

          <p className="text-center text-xs mt-8" style={{ color: '#4b5563' }}>
            계정 문의:{' '}
            <a href="mailto:center@eum.gyeongnam.go.kr"
              className="underline underline-offset-2"
              style={{ color: '#1457b8' }}>
              center@eum.gyeongnam.go.kr
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
