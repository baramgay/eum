import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_APP_VERSION,

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0.1,

  beforeSend(event) {
    // 개발 환경에서는 Sentry로 전송하지 않음 (DSN이 없어도 안전)
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
      return null
    }
    return event
  },
})
