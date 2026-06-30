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

const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  // eslint.ignoreDuringBuilds를 true로 설정하면 CI 빌드 중 ESLint 오류가 무시됩니다.
  // 린트 문제를 숨기지 않도록 기본값(false)을 유지합니다.
  eslint: { ignoreDuringBuilds: false },
  typescript: { ignoreBuildErrors: false },
  webpack: (config) => {
    // Windows/Next.js 14에서 클린 빌드 시 page-module 누락 오류가 간헐적으로 발생해
    // persistent cache를 비활성화하여 결정적인 빌드 결과를 얻는다.
    config.cache = false

    // .node 네이티브 바이너리 파일을 externals로 처리 (안전망)
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
      ({ request }, callback) => {
        if (request && request.endsWith('.node')) {
          return callback(null, `commonjs ${request}`)
        }
        callback()
      },
    ]
    return config
  },
  experimental: {
    serverActions: { allowedOrigins: getAllowedOrigins() },
    // ssh2/ssh2-sftp-client의 네이티브 .node 바이너리를 webpack 번들링에서 제외
    serverComponentsExternalPackages: ['ssh2', 'ssh2-sftp-client'],
    // Windows + Next.js 14 조합에서 워커 스레드 빌드 시 _document 모듈 누락 오류가 발생해 비활성화
    webpackBuildWorker: false,
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
