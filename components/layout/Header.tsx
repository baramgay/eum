'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Database, Map, ShieldCheck, GitBranch,
  FileBarChart2, Bot, Upload, RefreshCw, Settings2, KeyRound,
  BookOpen, Building2, Menu, X, ChevronDown, Layers, type LucideIcon,
} from 'lucide-react'

interface Tab {
  href: string
  label: string
  icon: LucideIcon
  role?: 'center'
}

const BASE_TABS: Tab[] = [
  { href: '/',           label: '대시보드',   icon: LayoutDashboard },
  { href: '/portal',     label: '데이터 포털', icon: Database },
  { href: '/map',        label: '지도',       icon: Map },
  { href: '/quality',    label: '품질',       icon: ShieldCheck },
  { href: '/ontology',   label: '온톨로지',   icon: GitBranch },
  { href: '/report',     label: '리포트',     icon: FileBarChart2 },
  { href: '/pipeline',   label: '실적 관리',  icon: Layers },
  { href: '/ai',         label: 'AI 질의',    icon: Bot },
  { href: '/submission', label: '데이터 등록', icon: Upload },
  { href: '/collect',    label: '수집',       icon: RefreshCw },
  { href: '/process',    label: '가공',       icon: Settings2 },
  { href: '/openapi',    label: '개방 API',   icon: KeyRound },
  { href: '/manual',     label: '도움말',     icon: BookOpen },
]

const CENTER_TAB: Tab = { href: '/admin', label: '기관 관리', icon: Building2, role: 'center' }

interface HeaderProps { userEmail?: string; role?: string }

export default function Header({ userEmail, role }: HeaderProps) {
  const pathname  = usePathname()
  const supabase  = createClient()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [userOpen,   setUserOpen]   = useState(false)

  const tabs = role === 'center' ? [...BASE_TABS, CENTER_TAB] : BASE_TABS

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href)
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : '?'
  const roleLabel: Record<string, string> = { center: '센터', agency: '기관', viewer: '일반' }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
      {/* ── 상단 바 ── */}
      <div className="max-w-screen-2xl mx-auto px-4 lg:px-6">
        <div className="flex items-center justify-between h-14">
          {/* 브랜드 */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0 group">
            <Image
              src="/eum_icon.png"
              alt="이음 로고"
              width={32}
              height={32}
              className="rounded-lg"
              priority
            />
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-gray-900 tracking-tight group-hover:text-blue-600 transition-colors">이음</span>
              <span className="text-xs font-medium text-gray-400 hidden sm:block">경남 공공데이터 개방 플랫폼</span>
            </div>
          </Link>

          {/* 우측 사용자 영역 */}
          <div className="flex items-center gap-3">
            {/* 사용자 드롭다운 */}
            {userEmail && (
              <div className="relative hidden md:block">
                <button
                  onClick={() => setUserOpen(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {initials}
                  </div>
                  <span className="text-sm text-gray-700 max-w-[140px] truncate">{userEmail}</span>
                  {role && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">
                      {roleLabel[role] ?? role}
                    </span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
                {userOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setUserOpen(false)} />
                    <div className="absolute right-0 mt-1 w-44 bg-white rounded-xl shadow-lg ring-1 ring-gray-200 overflow-hidden z-20">
                      <div className="px-3 py-2.5 border-b border-gray-100">
                        <p className="text-xs text-gray-500 truncate">{userEmail}</p>
                      </div>
                      <button
                        onClick={signOut}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        로그아웃
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 모바일 햄버거 */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="메뉴"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── 탭 네비게이션 바 ── */}
      <div className="max-w-screen-2xl mx-auto px-2 lg:px-4">
        <nav className="hidden md:flex overflow-x-auto scrollbar-none items-center gap-0.5 h-10 border-t border-gray-100">
          {tabs.map(t => {
            const active = isActive(t.href)
            const Icon = t.icon
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                  flex-shrink-0 whitespace-nowrap transition-all
                  ${active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}
                `}
              >
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                {t.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* ── 모바일 메뉴 ── */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-4 py-3 shadow-lg">
          <div className="grid grid-cols-3 gap-1.5">
            {tabs.map(t => {
              const active = isActive(t.href)
              const Icon = t.icon
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-xs font-medium text-center transition-colors
                    ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}
                  `}
                >
                  <Icon className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="leading-tight">{t.label}</span>
                </Link>
              )
            })}
          </div>
          {userEmail && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                  {initials}
                </div>
                <span className="text-sm text-gray-600 truncate max-w-[160px]">{userEmail}</span>
              </div>
              <button onClick={signOut} className="text-sm text-red-500 font-medium px-3 py-1 rounded-lg hover:bg-red-50">
                로그아웃
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
