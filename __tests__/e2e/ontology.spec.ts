import { test, expect } from '@playwright/test'
import { login, AGENCY_EMAIL, AGENCY_PASSWORD } from './helpers/auth'

test.describe('온톨로지', () => {
  test('온톨로지 페이지를 로드하고 그래프 캔버스가 보인다', async ({ page }) => {
    await login(page, AGENCY_EMAIL, AGENCY_PASSWORD)
    await page.goto('/ontology')

    await expect(page.getByRole('heading', { name: '온톨로지 탐색' })).toBeVisible()

    await page.getByRole('button', { name: '그래프', exact: true }).click()

    // 그래프 데이터가 없으면 재구축 후 다시 확인한다.
    const empty = page.getByTestId('graph-empty-state')
    if (await empty.isVisible().catch(() => false)) {
      await page.getByRole('button', { name: '온톨로지 재구축' }).first().click()
      // 재구축 중 스켈레톤이 사라질 때까지 대기
      await expect(page.getByTestId('graph-skeleton')).toHaveCount(0, { timeout: 30000 })
      await page.reload()
      await page.getByRole('button', { name: '그래프', exact: true }).click()
    }

    // 로딩 스켈레톤이 사라질 때까지 대기
    await expect(page.getByTestId('graph-skeleton')).toHaveCount(0, { timeout: 15000 })

    const graphCanvas = page.getByTestId('ontology-graph-canvas')
    await expect(graphCanvas).toBeVisible({ timeout: 15000 })
  })
})
