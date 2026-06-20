import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://aazlfabntszzhnefqbpe.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_KEY
const NEW_PASSWORD = '123456'

const TEST_EMAILS = [
  'center@test.eum',
  'agency.changwon@test.eum',
  'agency.jinju@test.eum',
  'agency.gimhae@test.eum',
  'viewer@test.eum',
]

if (!SERVICE_ROLE_KEY) { console.error('SUPABASE_SERVICE_KEY 환경변수 필요'); process.exit(1) }

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data: { users }, error: listErr } = await admin.auth.admin.listUsers()
if (listErr) { console.error('유저 목록 조회 실패:', listErr.message); process.exit(1) }

for (const email of TEST_EMAILS) {
  const user = users.find(u => u.email === email)
  if (!user) {
    console.log(`⚠️  ${email} — 계정 없음 (건너뜀)`)
    continue
  }
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: NEW_PASSWORD })
  if (error) {
    console.log(`❌  ${email} — 실패: ${error.message}`)
  } else {
    console.log(`✅  ${email} — 비밀번호 변경 완료`)
  }
}
