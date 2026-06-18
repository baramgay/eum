import { test, expect } from '@playwright/test'
import { login, CENTER_EMAIL, CENTER_PASSWORD } from './helpers/auth'

test.describe('품질 진단', () => {
  test('전체 품질 진단을 실행하고 결과를 확인한다', async ({ page }) => {
    await login(page, CENTER_EMAIL, CENTER_PASSWORD)
    await page.goto('/quality')

    await expect(page.getByRole('heading', { name: '품질 진단' })).toBeVisible()

    const runButton = page.getByRole('button', { name: '전체 재검사' })
    await runButton.click()

    // 진단 실행 완료까지 대기한다.
    await expect(runButton).toBeEnabled({ timeout: 60000 })

    // 결과 영역(5영역 신호등)이 표시된다.
    await expect(page.getByText('품질 5영역 신호등')).toBeVisible({ timeout: 60000 })
  })
})
