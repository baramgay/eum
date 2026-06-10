'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const TABS = [
  { href: '/',           label: '대시보드' },
  { href: '/portal',     label: '데이터 포털' },
  { href: '/quality',    label: '품질 진단' },
  { href: '/ontology',   label: '온톨로지' },
  { href: '/ai',         label: 'AI 질의' },
  { href: '/submission', label: '데이터 등록' },
]

interface HeaderProps { userEmail?: string; role?: string }

export default function Header({ userEmail, role }: HeaderProps) {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="bg-blue-700 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg tracking-tight">이음(EUM)</span>
            <span className="text-blue-200 text-xs hidden sm:block">경남 공공데이터 개방 플랫폼</span>
          </div>
          <nav className="hidden md:flex gap-1">
            {TABS.map(t => (
              <Link
                key={t.href} href={t.href}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  pathname === t.href ? 'bg-white text-blue-700' : 'text-blue-100 hover:bg-blue-600'
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            {userEmail && (
              <span className="text-blue-200 text-xs hidden sm:block">
                {userEmail} {role && <span className="bg-blue-800 px-1.5 py-0.5 rounded">{role}</span>}
              </span>
            )}
            <button
              onClick={signOut}
              className="text-xs text-blue-200 hover:text-white border border-blue-500 px-2 py-1 rounded"
            >
              로그아웃
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
