import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = process.env.TEST_EMAIL || 'test-inspector@eum.test'
const PASSWORD = process.env.TEST_PASSWORD || 'Test1234!'
const BASE = 'http://localhost:3001'

if (!URL || !SERVICE_KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요')
  process.exit(1)
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// 사용자 생성/갱신
async function ensureUser() {
  const { error: createErr } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { role: 'center', tenant_id: '48000', name: '점검 테스트' }
  })
  if (createErr && createErr.message === 'User already registered') {
    const { data: users } = await supabase.auth.admin.listUsers()
    const existing = users.users.find(u => u.email === EMAIL)
    if (existing) {
      await supabase.auth.admin.updateUserById(existing.id, {
        password: PASSWORD,
        user_metadata: { role: 'center', tenant_id: '48000', name: '점검 테스트' }
      })
    }
  }
}

// 세션 획득 및 쿠키 생성
async function getSessionCookie() {
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) throw error
  const session = data.session
  const projectRef = URL.replace(/^https?:\/\//, '').split('.')[0]
  const cookieName = `sb-${projectRef}-auth-token`
  const cookieValue = Buffer.from(JSON.stringify(session)).toString('base64')
  return { cookieName, cookieValue, session }
}

async function fetchWithAuth(path, cookie) {
  const headers = { Cookie: `${cookie.cookieName}=${encodeURIComponent(cookie.cookieValue)}` }
  const res = await fetch(`${BASE}${path}`, { headers, redirect: 'manual' })
  return { status: res.status, location: res.headers.get('location') || '' }
}

async function fetchPublic(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual' })
  return { status: res.status, location: res.headers.get('location') || '', text: await res.text() }
}

async function main() {
  await ensureUser()
  const cookie = await getSessionCookie()

  const routes = [
    { path: '/', auth: true },
    { path: '/login', auth: false },
    { path: '/portal', auth: true },
    { path: '/submission', auth: true },
    { path: '/quality', auth: true },
    { path: '/process', auth: true },
    { path: '/ontology', auth: true },
    { path: '/nlquery', auth: true },
    { path: '/ai', auth: true },
    { path: '/collect', auth: true },
    { path: '/openapi', auth: true },
    { path: '/analytics', auth: true },
    { path: '/report', auth: true },
    { path: '/map', auth: true },
    { path: '/manual', auth: false },
    { path: '/admin', auth: true },
    { path: '/api/dcat', auth: false },
    { path: '/api/overview', auth: false },
    { path: '/api/v1/datasets', auth: false, apiKey: true },
    { path: '/api/quality', auth: false },
    { path: '/api/ontology', auth: false },
    { path: '/api/chat', auth: false },
    { path: '/api/nlquery?query=인구', auth: false },
  ]

  console.log('=== 무인증/공개 경로 점검 ===')
  for (const r of routes.filter(r => !r.auth)) {
    try {
      const res = await fetchPublic(r.path)
      console.log(`${r.path}: ${res.status} ${res.location ? '-> ' + res.location : ''}`)
      if (res.status >= 500) {
        console.log('  ERROR:', res.text.slice(0, 200))
      }
    } catch (e) {
      console.log(`${r.path}: EXCEPTION ${e.message}`)
    }
  }

  console.log('\n=== 인증 필요 경로 점검 (center role) ===')
  for (const r of routes.filter(r => r.auth)) {
    try {
      const res = await fetchWithAuth(r.path, cookie)
      console.log(`${r.path}: ${res.status} ${res.location ? '-> ' + res.location : ''}`)
    } catch (e) {
      console.log(`${r.path}: EXCEPTION ${e.message}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
