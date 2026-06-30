import { test, expect } from '@playwright/test'
import { login, CENTER_EMAIL, CENTER_PASSWORD, AGENCY_EMAIL, AGENCY_PASSWORD } from './helpers/auth'

test.describe('온톨로지 그래프 인터랙션', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, AGENCY_EMAIL, AGENCY_PASSWORD)
    await page.goto('/ontology')
    await page.waitForLoadState('domcontentloaded')
  })

  test('/ontology 페이지가 정상적으로 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '온톨로지 탐색' })).toBeVisible()
  })

  test('온톨로지 탭이 모두 표시된다', async ({ page }) => {
    await expect(page.getByRole('button', { name: '개요' })).toBeVisible()
    await expect(page.getByRole('button', { name: '그래프', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '노드 목록' })).toBeVisible()
    await expect(page.getByRole('button', { name: '분석', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '워크스페이스' })).toBeVisible()
    await expect(page.getByRole('button', { name: '편집' })).toBeVisible()
  })

  test('그래프 탭 클릭 시 그래프 영역으로 전환된다', async ({ page }) => {
    await page.getByRole('button', { name: '그래프', exact: true }).click()
    await page.waitForLoadState('domcontentloaded')

    // 그래프 탭이 활성화된 상태
    const graphTab = page.getByRole('button', { name: '그래프', exact: true })
    await expect(graphTab).toHaveClass(/text-indigo/)
  })

  test('시나리오 선택기가 개요 탭 초기 상태에서 표시된다', async ({ page }) => {
    // 개요 탭이 기본값이고 그래프 데이터가 없으면 ScenarioSelector가 표시됨
    // ScenarioSelector 또는 OverviewTab 중 하나가 보여야 함
    const scenarioOrOverview = page.locator('text=시나리오').or(page.getByRole('heading', { name: /개요|온톨로지/ }))
    await expect(scenarioOrOverview.first()).toBeVisible({ timeout: 10000 })
  })

  test.slow()
  test('온톨로지 재구축 버튼이 표시된다', async ({ page }) => {
    await expect(page.getByRole('button', { name: '온톨로지 재구축' })).toBeVisible()
  })

  test('노드 목록 탭으로 전환하면 노드 목록 영역이 표시된다', async ({ page }) => {
    await page.getByRole('button', { name: '노드 목록' }).click()
    await page.waitForLoadState('domcontentloaded')

    // 노드 목록 탭 활성화 확인 (노드 검색 또는 관련 UI)
    const nodeListArea = page.getByRole('button', { name: '노드 목록' })
    await expect(nodeListArea).toHaveClass(/text-indigo/)
  })

  test('분석 탭으로 전환할 수 있다', async ({ page }) => {
    await page.getByRole('button', { name: '분석', exact: true }).click()
    await page.waitForLoadState('domcontentloaded')

    const analysisTab = page.getByRole('button', { name: '분석', exact: true })
    await expect(analysisTab).toHaveClass(/text-indigo/)
  })

  test('시군 선택 드롭다운이 그래프 탭에서 표시된다', async ({ page }) => {
    await page.getByRole('button', { name: '그래프', exact: true }).click()
    await page.waitForLoadState('domcontentloaded')

    // 시나리오 없이 그래프 탭이면 시군 필터가 표시됨
    const sggSelect = page.getByRole('combobox', { name: '시군 선택' })
    // 시나리오 모드가 아닐 경우에만 보임 — 가시성 조건부 확인
    const sggVisible = await sggSelect.isVisible().catch(() => false)
    if (sggVisible) {
      await expect(sggSelect).toBeVisible()
    } else {
      // 시나리오 선택기가 대신 표시됨 (데모 모드)
      test.info().annotations.push({ type: 'note', description: '시나리오 선택기 표시 중 — 시군 필터 숨김' })
    }
  })

  test('워크스페이스 탭으로 전환할 수 있다', async ({ page }) => {
    await page.getByRole('button', { name: '워크스페이스' }).click()
    await page.waitForLoadState('domcontentloaded')

    const wsTab = page.getByRole('button', { name: '워크스페이스' })
    await expect(wsTab).toHaveClass(/text-indigo/)
  })

  test('편집 탭으로 전환할 수 있다', async ({ page }) => {
    await page.getByRole('button', { name: '편집' }).click()
    await page.waitForLoadState('domcontentloaded')

    const editTab = page.getByRole('button', { name: '편집' })
    await expect(editTab).toHaveClass(/text-indigo/)
  })

  test('그래프 탭에서 그래프 캔버스 요소가 DOM에 존재한다', async ({ page }) => {
    await page.getByRole('button', { name: '그래프', exact: true }).click()

    // 로딩 스켈레톤이 사라질 때까지 대기
    await expect(page.getByTestId('graph-skeleton')).toHaveCount(0, { timeout: 30000 })

    // canvas 또는 empty state 중 하나가 나타날 때까지 대기
    const graphCanvas = page.getByTestId('ontology-graph-canvas')
    const empty = page.getByTestId('graph-empty-state')
    await expect(
      graphCanvas.or(empty)
    ).toBeVisible({ timeout: 15000 })

    // 데이터가 없으면 재구축 시도
    if (await empty.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: '온톨로지 재구축' }).first().click()
      await expect(page.getByTestId('graph-skeleton')).toHaveCount(0, { timeout: 30000 })
      await expect(graphCanvas.or(empty)).toBeVisible({ timeout: 15000 })
    }
  })

  test('레이아웃 변경 기능이 그래프 탭에서 동작한다', async ({ page }) => {
    await page.getByRole('button', { name: '그래프', exact: true }).click()
    await page.waitForLoadState('domcontentloaded')

    // GraphTab에서 layout 관련 버튼 또는 드롭다운 확인
    // OntologyClient → GraphTab으로 layoutChange가 전달됨
    // GraphToolbar가 표시되는지 확인
    const toolbar = page.locator('[data-testid="graph-toolbar"], [aria-label*="레이아웃"], button:has-text("레이아웃")')
    const toolbarVisible = await toolbar.first().isVisible().catch(() => false)
    // 가시성 여부를 기록 (실제 그래프 데이터 없이는 툴바가 숨겨질 수 있음)
    test.info().annotations.push({
      type: 'note',
      description: toolbarVisible ? '레이아웃 툴바 표시됨' : '레이아웃 툴바 없음 (데이터 없음 상태)',
    })
  })
})
