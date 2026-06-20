'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff } from 'lucide-react'
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
    <div className="min-h-screen flex">
      {/* 좌측 브랜드 패널 (md 이상) */}
      <div className="hidden md:flex md:w-[420px] lg:w-[480px] flex-col justify-between bg-gray-900 p-10 shrink-0">
        <div>
          {/* 로고 */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <span className="text-white font-semibold tracking-tight">이음(EUM)</span>
          </div>

          {/* 카피 */}
          <div className="mt-16">
            <p className="text-2xl font-bold text-white leading-snug">
              경남 공공데이터<br />개방 플랫폼
            </p>
            <p className="mt-4 text-sm text-gray-400 leading-relaxed">
              경상남도 내 공공기관의 데이터를<br />
              수집·정제·분석·개방하는 통합 허브입니다.
            </p>
          </div>

          {/* 지표 */}
          <div className="mt-12 grid grid-cols-2 gap-4">
            {[
              { label: '연동 기관', value: '18+' },
              { label: '공개 데이터셋', value: '240+' },
              { label: '온톨로지 노드', value: '1,200+' },
              { label: '일 평균 조회', value: '3,400+' },
            ].map(item => (
              <div key={item.label} className="rounded-lg bg-white/5 p-4">
                <p className="text-xl font-bold text-white">{item.value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-gray-500">
          경남빅데이터센터 GNI · {new Date().getFullYear()}
        </p>
      </div>

      {/* 우측 로그인 폼 */}
      <div className="flex-1 flex flex-col justify-center items-center bg-gray-50 px-6 py-12">
        {/* 모바일 로고 */}
        <div className="md:hidden mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <span className="font-semibold text-gray-900">이음(EUM)</span>
          </div>
          <p className="text-sm text-gray-500">경남 공공데이터 개방 플랫폼</p>
        </div>

        <div className="w-full max-w-[360px]">
          <div className="mb-8">
            <h1 className="text-xl font-bold text-gray-900">로그인</h1>
            <p className="text-sm text-gray-500 mt-1">계속하려면 계정 정보를 입력하세요.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <FormError id="password-error" message={errors.password} />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-lg
                         hover:bg-gray-800 active:bg-black disabled:opacity-50 transition-colors mt-1
                         flex items-center justify-center gap-2"
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

          <p className="text-center text-xs text-gray-400 mt-8">
            계정 문의:{' '}
            <a href="mailto:center@eum.gyeongnam.go.kr"
              className="underline underline-offset-2 hover:text-gray-600 transition-colors">
              center@eum.gyeongnam.go.kr
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
