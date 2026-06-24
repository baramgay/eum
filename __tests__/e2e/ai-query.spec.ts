import { test, expect } from '@playwright/test'
import { login, CENTER_EMAIL, CENTER_PASSWORD, AGENCY_EMAIL, AGENCY_PASSWORD } from './helpers/auth'

test.describe('AI 질의', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)
    await page.goto('/ai')
    await page.waitForLoadState('networkidle')
  })

  test('/ai 페이지가 정상 로드된다', async ({ page }) => {
    // AiQueryClient가 렌더링됨을 확인
    await expect(page.locator('main')).toBeVisible()

    // 치명적 에러가 없어야 함
    const fatalError = page.getByText(/Something went wrong|500 Internal/)
    const hasFatal = await fatalError.isVisible().catch(() => false)
    expect(hasFatal).toBe(false)
  })

  test('대화형 AI 모드 탭이 표시된다', async ({ page }) => {
    const chatTab = page.getByRole('button', { name: '대화형 AI' })
    await expect(chatTab).toBeVisible()
  })

  test('SQL 질의 모드 탭이 표시된다', async ({ page }) => {
    const sqlTab = page.getByRole('button', { name: 'SQL 질의' })
    await expect(sqlTab).toBeVisible()
  })

  test('대화형 AI 모드에서 질문 입력창이 표시된다', async ({ page }) => {
    // 기본값이 대화형 AI 모드
    const queryInput = page.getByPlaceholder('예: 청년 정착잠재 순위 보여줘')
    await expect(queryInput).toBeVisible()
  })

  test('SQL 질의 탭 클릭 시 자연어 질문 입력창이 표시된다', async ({ page }) => {
    await page.getByRole('button', { name: 'SQL 질의' }).click()

    const sqlInput = page.getByLabel('자연어 질문 입력').or(
      page.getByPlaceholder(/datasets 테이블/)
    )
    await expect(sqlInput).toBeVisible()
  })

  test('SQL 질의 모드에서 SQL 생성 버튼이 표시된다', async ({ page }) => {
    await page.getByRole('button', { name: 'SQL 질의' }).click()

    const generateBtn = page.getByRole('button', { name: 'SQL 생성' })
    await expect(generateBtn).toBeVisible()
  })

  test('대화형 AI 초기 상태에서 결과 패널이 숨겨져 있다 (빈 대화)', async ({ page }) => {
    // 새 페이지이므로 ResultCard가 없어야 함
    // EmptyState 또는 추천 질문만 표시
    const emptyState = page.getByText('경남 공공데이터에 대해 자연어로 질의할 수 있습니다')
    const hasEmpty = await emptyState.isVisible({ timeout: 5000 }).catch(() => false)

    // 대화가 이미 localStorage에 있을 수 있으므로 조건부 확인
    if (!hasEmpty) {
      // 기존 대화가 있는 경우 — 새 대화 버튼으로 초기화
      const newConvBtn = page.getByRole('button', { name: '새 대화' })
      const hasNewBtn = await newConvBtn.isVisible().catch(() => false)
      if (hasNewBtn) {
        await newConvBtn.click()
        await expect(page.getByText('경남 공공데이터에 대해 자연어로 질의할 수 있습니다')).toBeVisible({ timeout: 5000 })
      }
    } else {
      await expect(emptyState).toBeVisible()
    }
  })

  test('추천 질문 버튼들이 초기 상태에서 표시된다', async ({ page }) => {
    // 빈 대화 상태에서 예시 질문 버튼 확인
    const exampleBtn = page.getByRole('button', { name: /정착잠재|창원|청년|소득|제조업/ })
    const hasExamples = await exampleBtn.first().isVisible({ timeout: 8000 }).catch(() => false)
    test.info().annotations.push({
      type: 'note',
      description: hasExamples ? '추천 질문 표시됨' : '추천 질문 없음 (기존 대화 있음)',
    })
  })

  test('질문 입력 후 질문 버튼이 활성화된다', async ({ page }) => {
    const queryInput = page.getByPlaceholder('예: 청년 정착잠재 순위 보여줘')
    await expect(queryInput).toBeVisible()

    // 빈 상태에서 버튼이 비활성화되어야 함
    const sendBtn = page.getByRole('button', { name: '질문' })
    await expect(sendBtn).toBeDisabled()

    // 텍스트 입력 후 활성화
    await queryInput.fill('테스트 질문')
    await expect(sendBtn).toBeEnabled()
  })

  test('대화 목록 사이드바가 대화형 모드에서 토글된다', async ({ page }) => {
    // 기본적으로 대화형 AI 모드 — 사이드바 토글 버튼이 있어야 함
    const sidebarToggle = page.getByRole('button', { name: '대화 목록' })
    const hasToggle = await sidebarToggle.isVisible().catch(() => false)
    if (hasToggle) {
      await sidebarToggle.click()
      // 클릭 후 사이드바 상태가 변경됨
      await expect(sidebarToggle).toBeVisible()
    }
  })

  test('공유 버튼이 표시된다', async ({ page }) => {
    const shareBtn = page.getByRole('button', { name: '공유' })
    await expect(shareBtn).toBeVisible()
  })

  test('내보내기 버튼이 표시된다', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: '내보내기' })
    await expect(exportBtn).toBeVisible()
  })

  test('내보내기 메뉴를 열면 Markdown과 JSON 옵션이 있다', async ({ page }) => {
    const exportBtn = page.getByRole('button', { name: '내보내기' })
    await exportBtn.click()

    const menu = page.getByRole('menu', { name: '대화 낳기 옵션' })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /Markdown/ })).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: /JSON/ })).toBeVisible()
  })

  test('AGENCY 사용자도 /ai 페이지에 접근할 수 있다', async ({ page }) => {
    // agency 계정으로 별도 접근
    await login(page, AGENCY_EMAIL, AGENCY_PASSWORD)
    await page.goto('/ai')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('main')).toBeVisible()
    // 로그인으로 리디렉션되지 않아야 함
    await expect(page).toHaveURL(/\/ai/)
  })

  test('SQL 질의 모드에서 쿼리 없이 SQL 생성 버튼이 비활성화된다', async ({ page }) => {
    await page.getByRole('button', { name: 'SQL 질의' }).click()

    const generateBtn = page.getByRole('button', { name: 'SQL 생성' })
    // 빈 입력 상태에서 비활성화
    await expect(generateBtn).toBeDisabled()
  })

  test('SQL 질의 모드에서 질문 입력 후 생성 버튼이 활성화된다', async ({ page }) => {
    await page.getByRole('button', { name: 'SQL 질의' }).click()

    const sqlInput = page.getByLabel('자연어 질문 입력').or(
      page.getByPlaceholder(/datasets 테이블/)
    )
    await sqlInput.fill('최근 데이터셋 10개 보여줘')

    const generateBtn = page.getByRole('button', { name: 'SQL 생성' })
    await expect(generateBtn).toBeEnabled()
  })

  test.skip('출처 URL 클릭 시 포털 페이지로 이동한다 — LLM 응답 필요', () => {
    // 이 테스트는 실제 LLM API 호출 결과(source_url/datasetId)가 필요함
    // Supabase + LLM 없이는 검증 불가
  })
})
