# EUM 플랫폼 배포 가이드

## 개요

- **프론트엔드**: Vercel (`next build` → `next start`)
- **백엔드/데이터**: Supabase (Postgres + Auth)
- **CI/CD**: GitHub Actions
- **컨테이너**: Docker + docker-compose (로컬/온프레미스용)

## GitHub Actions Secrets

아래 Secret을 리포지토리에 등록해야 합니다.

| Secret | 설명 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (서버/시드 전용) |
| `SUPABASE_PROJECT_ID` | Supabase project ref |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI access token |
| `VERCEL_TOKEN` | Vercel CLI token |
| `VERCEL_ORG_ID` | Vercel 조직 ID |
| `VERCEL_PROJECT_ID` | Vercel 프로젝트 ID |
| `TEST_CENTER_EMAIL` | E2E 센터 테스트 계정 이메일 |
| `TEST_CENTER_PASSWORD` | E2E 센터 테스트 계정 비밀번호 |
| `TEST_AGENCY_EMAIL` | E2E 기관 테스트 계정 이메일 |
| `TEST_AGENCY_PASSWORD` | E2E 기관 테스트 계정 비밀번호 |

## Vercel 환경 변수

Vercel 프로젝트 설정에서도 다음 환경 변수를 등록합니다.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_APP_URL` (예: `https://eum.example.com`)
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `COLLECTION_SECRET`
- `QWEN_API_KEY` / `QWEN_BASE_URL` / `QWEN_MODEL` (선택)
- `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `CENTER_NOTIFICATION_EMAIL` (선택)

## Supabase 마이그레이션

로컬 개발 및 CI/CD는 Supabase CLI를 사용합니다.

```bash
# 프로젝트 연동
npx supabase link --project-ref <project-ref>

# 마이그레이션 상태 확인
npx supabase db push --include-all --dry-run

# 실제 적용 (운영 배포 전 반드시 dry-run 확인)
npx supabase db push
```

마이그레이션 파일은 `supabase/migrations/`에 저장되어 있으며, `supabase/config.toml`의 `project_id`를 실제 프로젝트 ref로 맞추세요.

## Docker 사용

### 이미지 빌드 및 실행

```bash
# 단일 컨테이너
docker build -t eum-platform .
docker run -p 3000:3000 --env-file .env.local eum-platform
```

### docker-compose

```bash
# 앱 + Python analyzer 함께 실행
docker-compose up --build
```

- `app`: Next.js 서비스 (`http://localhost:3000`)
- `analyzer`: `scripts/analyze.py`를 실행하는 Python 3.11 컨테이너

## 배포 워크플로우

1. `main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 실행됩니다.
2. `ci` job이 `./.github/workflows/ci.yml`을 재사용하여 타입체크·린트·유닛테스트·빌드·E2E를 수행합니다.
3. `deploy` job에서 Supabase 마이그레이션 dry-run을 확인합니다.
4. 마지막으로 `vercel --prod`로 프로덕션 배포가 수행됩니다.
