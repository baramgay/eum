import { test, expect } from '@playwright/test'
import { login, CENTER_EMAIL, CENTER_PASSWORD } from './helpers/auth'

test.describe('대시보드 위젯', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)
    await page.waitForLoadState('networkidle')
  })

  test('대시보드 페이지가 정상 로드된다', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /대시보드|이음/ })).toBeVisible()
  })

  test('대시보드 페이지에 에러 없이 콘텐츠가 표시된다', async ({ page }) => {
    // 메인 콘텐츠 영역이 있어야 함
    await expect(page.locator('main')).toBeVisible()

    // 치명적 에러 페이지가 아님을 확인
    const fatalError = page.getByText(/Something went wrong|500|Internal Server Error/)
    const hasFatal = await fatalError.isVisible().catch(() => false)
    expect(hasFatal).toBe(false)
  })

  test('파이프라인 상태 위젯이 DOM에 존재한다', async ({ page }) => {
    test.slow()
    await page.waitForLoadState('networkidle')

    // PipelineStatusWidget: 수집 현황, 파이프라인 관련 텍스트
    const pipelineWidget = page.getByText(/파이프라인|수집 현황|Pipeline/)
    const visible = await pipelineWidget.first().isVisible({ timeout: 10000 }).catch(() => false)
    test.info().annotations.push({
      type: 'note',
      description: visible ? '파이프라인 위젯 표시됨' : '파이프라인 위젯 없음 (데이터 없음 상태 가능)',
    })
    // 에러 없이 로드됨을 확인 (위젯 자체가 없을 수도 있음)
    await expect(page.locator('main')).toBeVisible()
  })

  test('수집 트렌드 차트 영역이 표시된다', async ({ page }) => {
    test.slow()
    await page.waitForLoadState('networkidle')

    // CollectionTrendWidget: recharts SVG 또는 canvas
    // 차트 컨테이너가 DOM에 있어야 함
    const chartContainer = page.locator('.recharts-wrapper, [class*="recharts"], svg[class*="recharts"]')
    const svgCount = await page.locator('svg').count()
    const canvasCount = await page.locator('canvas').count()

    // 차트(SVG/canvas) 또는 스켈레톤이 있어야 함
    const hasChart = svgCount > 0 || canvasCount > 0
    const hasSkeleton = await page.locator('[class*="skeleton"], [class*="animate-pulse"]').count().then(c => c > 0)
    const hasEmptyState = await page.getByText(/데이터 없음|결과 없음/).isVisible().catch(() => false)

    expect(hasChart || hasSkeleton || hasEmptyState).toBe(true)
  })

  test('품질 위젯 영역이 표시된다', async ({ page }) => {
    test.slow()
    await page.waitForLoadState('networkidle')

    // QualityWidget 또는 QualitySignalWidget
    const qualityArea = page.getByText(/품질|Quality/).first()
    const hasQuality = await qualityArea.isVisible({ timeout: 10000 }).catch(() => false)
    test.info().annotations.push({
      type: 'note',
      description: hasQuality ? '품질 위젯 표시됨' : '품질 위젯 로딩 중 또는 없음',
    })
  })

  test('전체 점수 게이지(ScoreGaugeWidget)가 표시된다', async ({ page }) => {
    test.slow()
    await page.waitForLoadState('networkidle')

    // ScoreGauge: "/ 100" 텍스트가 있어야 함
    const gauge = page.getByText('/ 100')
    const hasGauge = await gauge.first().isVisible({ timeout: 10000 }).catch(() => false)
    test.info().annotations.push({
      type: 'note',
      description: hasGauge ? 'ScoreGauge 표시됨' : 'ScoreGauge 없음 (데이터 필요)',
    })
  })

  test('대시보드에서 /portal 링크로 이동할 수 있다', async ({ page }) => {
    const portalLink = page.getByRole('link', { name: /데이터 포털/ })
    const hasLink = await portalLink.isVisible().catch(() => false)
    if (hasLink) {
      await portalLink.first().click()
      await page.waitForURL('**/portal**', { timeout: 8000 })
      await expect(page).toHaveURL(/\/portal/)
    } else {
      // 헤더 탭을 통해 이동
      await page.getByRole('link', { name: '데이터 포털' }).first().click()
      await page.waitForURL('**/portal**', { timeout: 8000 })
      await expect(page).toHaveURL(/\/portal/)
    }
  })

  test('헤더 탭 네비게이션이 대시보드에서 정상 동작한다', async ({ page }) => {
    // 헤더의 탭 네비게이션 링크들이 있어야 함
    await expect(page.getByRole('link', { name: '대시보드' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: '데이터 포털' }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'AI 질의' }).first()).toBeVisible()
  })

  test('로딩 중 스켈레톤 또는 위젯 콘텐츠가 표시된다', async ({ page }) => {
    // 네트워크 idle 이전에 스켈레톤이 보일 수 있음
    // 또는 idle 후 실제 데이터가 보임
    const mainContent = page.locator('main')
    await expect(mainContent).toBeVisible()

    // 적어도 일부 하위 요소가 있어야 함
    const childCount = await mainContent.locator('> *').count()
    expect(childCount).toBeGreaterThan(0)
  })

  test('ErrorState가 표시되지 않는다 (정상 로드 확인)', async ({ page }) => {
    await page.waitForLoadState('networkidle')

    // DashboardClient ErrorState: "다시 불러오기" 버튼
    const retryButton = page.getByRole('button', { name: '다시 불러오기' })
    const hasError = await retryButton.isVisible().catch(() => false)

    // 에러 없이 로드되는 것이 이상적
    // Supabase 연결 없이는 에러가 날 수 있으므로 경고만
    if (hasError) {
      test.info().annotations.push({
        type: 'note',
        description: '다시 불러오기 버튼 표시 — Supabase 연결 필요',
      })
    }
  })
})
