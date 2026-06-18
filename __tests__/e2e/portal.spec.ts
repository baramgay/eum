import { test, expect } from '@playwright/test'
import { login, AGENCY_EMAIL, AGENCY_PASSWORD } from './helpers/auth'

test.describe('데이터 포털', () => {
  test('데이터셋 검색 및 상세 모달 플로우', async ({ page }) => {
    await login(page, AGENCY_EMAIL, AGENCY_PASSWORD)
    await page.goto('/portal')

    await expect(page.getByRole('heading', { name: '데이터 포털' })).toBeVisible()

    const search = page.getByPlaceholder('데이터셋 검색...')
    await search.fill('E2E')
    await search.press('Enter')

    const card = page.getByText('E2E 청년인구 현황').first()
    await expect(card).toBeVisible({ timeout: 10000 })
    await card.click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible()
    await expect(modal.locator('h3').getByText('E2E 청년인구 현황')).toBeVisible()

    await modal.getByRole('button', { name: '미리보기' }).first().click()
    await expect(modal.getByText(/미리보기/).first()).toBeVisible()

    await modal.getByRole('button', { name: '닫기' }).first().click()
    await expect(modal).not.toBeVisible()
  })
})
