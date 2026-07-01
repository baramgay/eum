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
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://dapi.kakao.com https://*.kakaocdn.net https://*.daumcdn.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.daumcdn.net https://*.kakaocdn.net https://map.kakao.com",
    "font-src 'self' https://cdn.jsdelivr.net",
    `connect-src ${connectSrc} https://dapi.kakao.com https://*.daumcdn.net https://*.kakaocdn.net https://map.kakao.com`,
    "worker-src 'self' blob: https://dapi.kakao.com https://*.kakaocdn.net",
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
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-XSS-Protection', value: '0' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
      ],
    },
  ]
}

// 번들 크기 분석: ANALYZE=true npx @next/bundle-analyzer 설치 후
// const withBundleAnalyzer = require('@next/bundle-analyzer')({ enabled: process.env.ANALYZE === 'true' })
// module.exports = withBundleAnalyzer(config)

const { withSentryConfig } = require('@sentry/nextjs')

const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  typescript: { ignoreBuildErrors: false },
  // ssh2/ssh2-sftp-client의 네이티브 .node 바이너리를 번들링에서 제외
  serverExternalPackages: ['ssh2', 'ssh2-sftp-client'],
  experimental: {
    serverActions: { allowedOrigins: getAllowedOrigins() },
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

module.exports = withSentryConfig(config, {
  // Sentry 자동 source map 업로드 등을 기본값으로 사용
  // DSN이 없으면 beforeSend에서 이벤트를 버리므로 로컬/스테이징에서도 안전
  silent: true,
})
