import type { Metadata } from 'next'
import localFont from 'next/font/local'
import dynamic from 'next/dynamic'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from '@/components/theme/ThemeProvider'
import RealtimeProvider from '@/components/realtime/RealtimeProvider'
import './globals.css'

const GuideChatbot = dynamic(() => import('@/components/common/GuideChatbot'), { ssr: false })

const pretendard = localFont({
  src: [
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-Thin.subset.woff2',      weight: '100', style: 'normal' },
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-ExtraLight.subset.woff2', weight: '200', style: 'normal' },
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-Light.subset.woff2',      weight: '300', style: 'normal' },
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-Regular.subset.woff2',    weight: '400', style: 'normal' },
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-Medium.subset.woff2',     weight: '500', style: 'normal' },
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-SemiBold.subset.woff2',   weight: '600', style: 'normal' },
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-Bold.subset.woff2',       weight: '700', style: 'normal' },
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-ExtraBold.subset.woff2',  weight: '800', style: 'normal' },
    { path: '../node_modules/pretendard/dist/web/static/woff2-subset/Pretendard-Black.subset.woff2',      weight: '900', style: 'normal' },
  ],
  variable: '--font-pretendard',
  display: 'swap',
})

export const metadata: Metadata = {
  title: '이음(EUM) — 경남 공공데이터 개방 플랫폼',
  description: '경남도 데이터 허브 · 온톨로지 · 개방 포털',
}

const themeScript = `
  (function() {
    try {
      const theme = localStorage.getItem('eum-theme') || 'system'
      const resolved = theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme
      if (resolved === 'dark') document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
    } catch (e) {}
  })()
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning className={pretendard.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background text-foreground font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:bg-blue-700 focus:text-white focus:px-4 focus:py-2 focus:rounded focus:text-sm focus:shadow-lg"
        >
          본문으로 바로가기
        </a>
        <ThemeProvider>
          <RealtimeProvider>
            <div id="main-content" tabIndex={-1} className="outline-none">
              {children}
            </div>
            <GuideChatbot />
          </RealtimeProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 3500,
              style: {
                borderRadius: '12px',
                background: '#1a1a1a',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '500',
                padding: '12px 16px',
                boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              },
              success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
              error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
