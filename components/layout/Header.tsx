'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { createFocusTrap } from '@/lib/focus-trap'
import {
  LayoutDashboard, Database, Map, ShieldCheck, GitBranch,
  FileBarChart2, Bot, Upload, RefreshCw, Settings2, KeyRound,
  BookOpen, Building2, Menu, X, ChevronDown, Layers, BarChart2,
  Bell, CheckCheck, type LucideIcon,
} from 'lucide-react'
import ThemeToggle from '@/components/theme/ThemeToggle'

interface Notification {
  id: string
  title: string
  message?: string | null
  link?: string | null
  read: boolean
  created_at: string
}

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
  { href: '/pipeline',   label: '파이프라인',  icon: Layers },
  { href: '/ai',         label: 'AI 질의',    icon: Bot },
  { href: '/submission', label: '데이터 등록', icon: Upload },
  { href: '/collect',    label: '수집',       icon: RefreshCw },
  { href: '/process',    label: '가공',       icon: Settings2 },
  { href: '/analytics',  label: '분석',       icon: BarChart2 },
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
  const [notifOpen,  setNotifOpen]  = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])

  const mobileMenuRef = useRef<HTMLElement>(null)
  const userMenuRef    = useRef<HTMLDivElement>(null)
  const notifMenuRef   = useRef<HTMLDivElement>(null)
  const userBtnRef     = useRef<HTMLButtonElement>(null)
  const notifBtnRef    = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!mobileOpen || !mobileMenuRef.current) return
    const trap = createFocusTrap(mobileMenuRef.current, {
      onClose: () => setMobileOpen(false),
      escapeCloses: true,
      returnFocus: true,
    })
    return () => trap.destroy()
  }, [mobileOpen])

  useEffect(() => {
    if (!userOpen || !userMenuRef.current) return
    const trap = createFocusTrap(userMenuRef.current, {
      onClose: () => setUserOpen(false),
      escapeCloses: true,
      returnFocus: true,
    })
    return () => trap.destroy()
  }, [userOpen])

  useEffect(() => {
    if (!notifOpen || !notifMenuRef.current) return
    const trap = createFocusTrap(notifMenuRef.current, {
      onClose: () => setNotifOpen(false),
      escapeCloses: true,
      returnFocus: true,
    })
    return () => trap.destroy()
  }, [notifOpen])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (userOpen && !userBtnRef.current?.contains(target) && !userMenuRef.current?.contains(target)) {
        setUserOpen(false)
      }
      if (notifOpen && !notifBtnRef.current?.contains(target) && !notifMenuRef.current?.contains(target)) {
        setNotifOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userOpen, notifOpen])

  useEffect(() => {
    if (!userEmail) return
    fetch('/api/notifications')
      .then(r => r.ok ? r.json() : [])
      .then((d: Notification[]) => setNotifications(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [userEmail])

  const unreadCount = notifications.filter(n => !n.read).length

  async function markAllRead() {
    const res = await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true, read: true }),
    })
    if (res.ok) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    }
  }

  const tabs = role === 'center' ? [...BASE_TABS, CENTER_TAB] : BASE_TABS

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : (pathname ?? '').startsWith(href)
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const initials = userEmail ? userEmail.slice(0, 2).toUpperCase() : '?'
  const roleLabel: Record<string, string> = { center: '센터', agency: '기관', viewer: '일반' }

  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40 shadow-sm">
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
              <span className="text-base font-bold text-gray-900 dark:text-gray-100 tracking-tight group-hover:text-blue-600 transition-colors">이음</span>
              <span className="text-xs font-medium text-gray-400 dark:text-gray-300 hidden sm:block">경남 공공데이터 개방 플랫폼</span>
            </div>
          </Link>

          {/* 우측 사용자 영역 */}
          <div className="flex items-center gap-3">
            {userEmail && (
              <div className="relative">
                <button
                  ref={notifBtnRef}
                  onClick={() => setNotifOpen(v => !v)}
                  className="relative p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label={`알림 ${unreadCount > 0 ? unreadCount + '개 미확인' : '없음'}`}
                  aria-expanded={notifOpen}
                  aria-haspopup="true"
                  aria-controls="header-notifications"
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div
                    id="header-notifications"
                    ref={notifMenuRef}
                    aria-label="알림 목록"
                    className="absolute right-0 mt-1 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-lg ring-1 ring-gray-200 dark:ring-gray-700 overflow-hidden z-20"
                  >
                      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">알림</span>
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllRead}
                            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            <CheckCheck className="w-3 h-3" />
                            모두 읽음
                          </button>
                        )}
                      </div>
                      <div className="max-h-72 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 text-center">
                            알림이 없습니다
                          </div>
                        ) : (
                          notifications.map(n => (
                            <a
                              key={n.id}
                              href={n.link ?? '#'}
                              onClick={() => setNotifOpen(false)}
                              className={`block px-3 py-2.5 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                                n.read ? 'opacity-70' : ''
                              }`}
                            >
                              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{n.title}</p>
                              {n.message && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{n.message}</p>
                              )}
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                                {new Date(n.created_at).toLocaleString('ko-KR')}
                              </p>
                            </a>
                          ))
                        )}
                      </div>
                    </div>
                )}
              </div>
            )}
            <ThemeToggle />
            {/* 사용자 드롭다운 */}
            {userEmail && (
              <div className="relative hidden md:block">
                <button
                  ref={userBtnRef}
                  onClick={() => setUserOpen(v => !v)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-expanded={userOpen}
                  aria-haspopup="true"
                  aria-controls="header-user-menu"
                >
                  <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {initials}
                  </div>
                  <span className="text-sm text-gray-700 dark:text-gray-300 max-w-[140px] truncate">{userEmail}</span>
                  {role && (
                    <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-1.5 py-0.5 rounded-full font-medium">
                      {roleLabel[role] ?? role}
                    </span>
                  )}
                  <ChevronDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-300" />
                </button>
                {userOpen && (
                  <div
                    id="header-user-menu"
                    ref={userMenuRef}
                    aria-label="사용자 메뉴"
                    className="absolute right-0 mt-1 w-44 bg-white dark:bg-gray-900 rounded-xl shadow-lg ring-1 ring-gray-200 overflow-hidden z-20"
                  >
                      <div className="px-3 py-2.5 border-b border-gray-100">
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{userEmail}</p>
                      </div>
                      <button
                        onClick={signOut}
                        className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        로그아웃
                      </button>
                    </div>
                )}
              </div>
            )}

            {/* 모바일 햄버거 */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              onClick={() => setMobileOpen(v => !v)}
              aria-label="메뉴"
              aria-expanded={mobileOpen}
              aria-controls="header-mobile-menu"
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
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800'}
                `}
              >
                <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-blue-600' : 'text-gray-400 dark:text-gray-300'}`} />
                {t.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* ── 모바일 메뉴 ── */}
      {mobileOpen && (
        <nav
          id="header-mobile-menu"
          ref={mobileMenuRef}
          aria-label="모바일 메뉴"
          className="md:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3 shadow-lg"
        >
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
                    ${active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}
                  `}
                >
                  <Icon className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-gray-400 dark:text-gray-300'}`} />
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
                <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[160px]">{userEmail}</span>
              </div>
              <button onClick={signOut} className="text-sm text-red-500 font-medium px-3 py-1 rounded-lg hover:bg-red-50">
                로그아웃
              </button>
            </div>
          )}
        </nav>
      )}
    </header>
  )
}
