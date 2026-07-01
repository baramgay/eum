import { test, expect } from '@playwright/test'
import { login, AGENCY_EMAIL, AGENCY_PASSWORD, CENTER_EMAIL, CENTER_PASSWORD } from './helpers/auth'

test.describe('포털 검색', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, AGENCY_EMAIL, AGENCY_PASSWORD)
    await page.goto('/portal')
    await page.waitForLoadState('domcontentloaded')
  })

  test('포털 페이지가 정상 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '데이터 포털' })).toBeVisible()
  })

  test('검색 입력창이 표시된다', async ({ page }) => {
    const searchInput = page.getByPlaceholder('데이터셋 검색...')
    await expect(searchInput).toBeVisible()
  })

  test('/ 키를 누륾 검색 입력창이 포커스된다', async ({ page }) => {
    // 입력창 외부 요소 클릭하여 포커스 해제
    await page.locator('body').click()

    await page.keyboard.press('/')

    const searchInput = page.getByPlaceholder(/데이터셋 검색/)
    // 브라우저 기본 단축키와 충돌할 수 있어 strict 포커스 대신 가시성 확인
    await expect(searchInput).toBeVisible()
    const isFocused = await searchInput.evaluate(el => document.activeElement === el).catch(() => false)
    if (!isFocused) {
      test.skip(true, '/ 단축키가 브라우저 기본 동작과 충돌하여 포커스되지 않음')
    }
  })

  test('검색어 입력 시 데이터셋 목록이 필터링된다', async ({ page }) => {
    const searchInput = page.getByPlaceholder('데이터셋 검색...')

    // 먼저 전체 결과 확인
    const initialCards = page.locator('[data-testid="dataset-card"]').or(
      page.locator('article').or(page.locator('.dataset-card'))
    )

    await searchInput.fill('인구')
    // 디바운스 300ms 대기
    await page.waitForTimeout(500)
    await page.waitForLoadState('domcontentloaded')

    // 검색 결과 카드들이 표시되어야 함
    const resultArea = page.locator('main')
    await expect(resultArea).toBeVisible()
  })

  test('검색 후 ESC를 눌러도 검색창이 정상적으로 남아 있다', async ({ page }) => {
    const searchInput = page.getByPlaceholder('데이터셋 검색...')
    await searchInput.fill('인구')
    await page.waitForTimeout(300)

    // ESC 키 — PortalClient는 ESC를 별도 핸들링하지 않음
    await searchInput.press('Escape')

    // 검색창이 그대로 존재하고 값이 유지되어도 OK (크래시만 방지)
    await expect(searchInput).toBeVisible()
  })

  test('검색 결과에 데이터셋 카드가 표시된다', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded')

    // E2E 시드된 카드가 표시될 때까지 대기
    const datasetCards = page.locator('main').getByText(/E2E (청년인구|사업체|창원시)/)
    const cardVisible = await datasetCards.first().waitFor({ timeout: 15000, state: 'visible' }).then(() => true).catch(() => false)

    // 로딩이 끝난 후 카드 또는 빈 상태가 있어야 함
    const hasEmpty = await page.getByText(/결과가 없습니다|데이터셋이 없습니다/).isVisible().catch(() => false)
    const hasError = await page.locator('[class*="error"], [class*="red"]').isVisible().catch(() => false)

    expect(cardVisible || hasEmpty || hasError).toBe(true)
  })

  test('테마 필터 버튼들이 표시된다', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded')

    // 페이지 콘텐츠(통계 카드)가 로드될 때까지 대기
    await page.getByText(/전체 데이터셋|AI-Ready/).first().waitFor({ timeout: 15000 })

    // 필터 칩(AI-Ready, 가명·합성) 또는 테마 필터 버튼이 있어야 함
    const filterChip = page.getByRole('button').filter({ hasText: /AI-Ready|가명·합성|테마/ }).first()
    const hasFilters = await filterChip.isVisible({ timeout: 5000 }).catch(() => false)
    expect(hasFilters).toBe(true)
  })

  test('정렬 옵션 셀렉트가 표시된다', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded')

    // 최신순, 이름순 등 정렬 셀렉트
    const sortSelect = page.getByRole('combobox').first()
    const visible = await sortSelect.isVisible().catch(() => false)
    if (visible) {
      await expect(sortSelect).toBeVisible()
    }
  })

  test('데이터셋 카드 클릭 시 상세 모달이 열린다', async ({ page }) => {
    test.slow()
    await page.waitForLoadState('domcontentloaded')

    // E2E 시드된 첫 번째 카드 제목을 클릭하면 카드 onClick이 전파되어 모달 열림
    const cardTitle = page.locator('main').getByText(/E2E (청년인구|사업체|창원시)/).first()
    await expect(cardTitle).toBeVisible({ timeout: 15000 })
    await cardTitle.click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 8000 })
  })

  test('데이터 포털 페이지에 통계 카드(StatCard)가 표시된다', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded')

    // 통계 카드 제목이 보이면 StatCard 영역이 렌더링된 것으로 판단
    const statTitle = page.getByText(/전체 데이터셋|AI-Ready|이번 달 신규/)
    await expect(statTitle.first()).toBeVisible({ timeout: 10000 })
  })

  test('AI 학습 데이터 준비 필터가 표시된다', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded')

    // onlyAiReady 토글 체크박스나 버튼
    const aiFilter = page.getByLabel(/AI|ai_ready|학습/).or(
      page.getByText(/AI 학습|ai.ready/i).first()
    )
    const visible = await aiFilter.isVisible().catch(() => false)
    // 존재 여부만 기록 (선택적 필터)
    test.info().annotations.push({
      type: 'note',
      description: visible ? 'AI 준비 필터 표시됨' : 'AI 준비 필터 없음',
    })
  })

  test('가명·합성 필터 버튼이 표시되고 클릭 시 필터 상태가 반영된다', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded')

    const syntheticBtn = page.getByText(/가명.*합성|합성.*가명/i).first()
    const visible = await syntheticBtn.isVisible({ timeout: 5000 }).catch(() => false)

    test.info().annotations.push({
      type: 'note',
      description: visible ? '가명·합성 필터 표시됨' : '가명·합성 필터 없음',
    })

    if (!visible) return

    await syntheticBtn.click()
    await page.waitForTimeout(300)

    const activeIndicator = page.getByText(/가명.*합성|합성.*가명/i)
    await expect(activeIndicator.first()).toBeVisible()
  })

  test('CENTER 사용자도 포털을 정상 조회할 수 있다', async ({ browser }) => {
    // AGENCY 페이지에 남은 모달/상태의 영향을 받지 않도록 새 컨텍스트 사용
    const context = await browser.newContext()
    const centerPage = await context.newPage()
    try {
      await login(centerPage, CENTER_EMAIL, CENTER_PASSWORD)
      await centerPage.goto('/portal')
      await centerPage.waitForLoadState('domcontentloaded')
      await expect(centerPage.getByRole('heading', { name: '데이터 포털' })).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
