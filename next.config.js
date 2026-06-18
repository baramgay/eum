/** @type {import('next').NextConfig} */

function getAllowedOrigins() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
  try {
    const { host } = new URL(appUrl)
    return host ? [host] : ['localhost:3001']
  } catch {
    return ['localhost:3001']
  }
}

function securityHeaders() {
  if (process.env.NODE_ENV !== 'production') return []

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const qwenBaseUrl = process.env.QWEN_BASE_URL || ''
  const connectSrc = [
    "'self'",
    supabaseUrl,
    qwenBaseUrl,
  ].filter(Boolean).join(' ')

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  return [
    {
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ]
}

const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverActions: { allowedOrigins: getAllowedOrigins() },
    // webpack 빌드를 워커 스레드에서 수행하여 빌드 시간 단축
    webpackBuildWorker: true,
    // 대형 barrel import 라이브러리의 트리셰이킹/번들 최적화
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'framer-motion',
      'd3',
      '@radix-ui/react-dialog',
      '@radix-ui/react-tooltip',
    ],
  },
  headers: securityHeaders,
}

module.exports = config
